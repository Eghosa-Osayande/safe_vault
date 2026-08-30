import { normalizeBackupSettings, normalizeExcludedVaultPaths } from "../domain/config";
import type { BackupSettings, Config, ConfigFactory } from "../domain/config";
import type { FolderProxy } from "../domain/file_system";
import type { PlatformBridge } from "../domain/platform_bridge";
import type { ArchiveStrategy, EncryptionStrategy, NamingStrategy, RemoteStrategy, VersionControlStrategy } from "../domain/strategies";
import {
  DefaultEncryptionStrategyFactory,
  DefaultNamingStrategyFactory,
  DefaultRemoteStrategyFactory,
  DefaultVersionControlStrategyFactory,
  TarArchiveStrategyFactory,
} from "../strategies";

class ResolvedConfig implements Config {
  constructor(
    private readonly settings: BackupSettings,
    private readonly vaultPath: string,
    private readonly platformBridge: PlatformBridge,
    private readonly naming: NamingStrategy,
    private readonly encryption: EncryptionStrategy,
    private readonly remote: RemoteStrategy,
    private readonly archive: ArchiveStrategy,
    private readonly versionControl: VersionControlStrategy,
  ) {}

  private resolveSettingPath(value: string): string {
    return this.platformBridge.getFileSystem().resolvePath(this.vaultPath, value);
  }

  getVaultDirectory(): FolderProxy {
    return this.platformBridge.getFileSystem().folder(this.vaultPath);
  }

  getBackupDirectory(): FolderProxy {
    return this.platformBridge.getFileSystem().folder(this.resolveSettingPath(this.settings.backupDirectory));
  }

  getEncryptionStrategy(): EncryptionStrategy {
    return this.encryption;
  }

  getRemoteStrategy(): RemoteStrategy {
    return this.remote;
  }

  getNamingStrategy(): NamingStrategy {
    return this.naming;
  }

  getArchiveStrategy(): ArchiveStrategy {
    return this.archive;
  }

  getVersionControlStrategy(): VersionControlStrategy {
    return this.versionControl;
  }

  getPlatformBridge(): PlatformBridge {
    return this.platformBridge;
  }

  getSettings(): BackupSettings {
    return { ...this.settings, excludedVaultPaths: [...this.settings.excludedVaultPaths] };
  }

  getExcludedPaths(): string[] {
    return normalizeExcludedVaultPaths(this.settings.excludedVaultPaths);
  }

  async validate(requireBackup = true): Promise<void> {
    const fileSystem = this.platformBridge.getFileSystem();
    const runner = this.platformBridge.getProcessRunner();
    if ((this.settings.versionControlStrategy === "git" || this.settings.remoteStrategy === "git") && !(await runner.available("git"))) {
      throw new Error("git is not installed or is not available on PATH.");
    }
    if (!(await runner.available("tar"))) throw new Error("tar is not installed or is not available on PATH.");
    if (!(await fileSystem.exists(this.vaultPath))) throw new Error(`Vault directory does not exist: ${this.vaultPath}`);
    normalizeExcludedVaultPaths(this.settings.excludedVaultPaths);
    if (!this.settings.backupDirectory.trim()) {
      if (requireBackup) throw new Error("No backup directory is configured. Run Configure backup first.");
      return;
    }
    const backup = this.resolveSettingPath(this.settings.backupDirectory);
    const vaultToRepository = fileSystem.relativePath(this.vaultPath, backup);
    const repositoryToVault = fileSystem.relativePath(backup, this.vaultPath);
    const isInside = (relativePath: string) => relativePath === "" || (!relativePath.startsWith("..") && !fileSystem.isAbsolutePath(relativePath));
    if (isInside(vaultToRepository) || isInside(repositoryToVault)) throw new Error("The vault and backup directory must not overlap.");
    await fileSystem.ensureFolder(backup);
    await this.encryption.validate();
  }
}

export class DefaultConfigFactory implements ConfigFactory {
  private readonly namingFactory = new DefaultNamingStrategyFactory();
  private readonly encryptionFactory: DefaultEncryptionStrategyFactory;
  private readonly remoteFactory: DefaultRemoteStrategyFactory;
  private readonly archiveFactory: TarArchiveStrategyFactory;
  private readonly versionControlFactory: DefaultVersionControlStrategyFactory;

  constructor(
    private readonly currentVaultPath: string,
    private readonly platformBridge: PlatformBridge,
  ) {
    const runner = platformBridge.getProcessRunner();
    const fileSystem = platformBridge.getFileSystem();
    this.encryptionFactory = new DefaultEncryptionStrategyFactory(runner);
    this.remoteFactory = new DefaultRemoteStrategyFactory(runner);
    this.archiveFactory = new TarArchiveStrategyFactory(runner, fileSystem);
    this.versionControlFactory = new DefaultVersionControlStrategyFactory(runner, fileSystem);
  }

  create(settings: BackupSettings): Config {
    const normalizedSettings = normalizeBackupSettings(settings);
    const fileSystem = this.platformBridge.getFileSystem();
    const vaultPath = fileSystem.resolvePath(normalizedSettings.vaultDirectory.trim() || this.currentVaultPath);
    const strategySettings: BackupSettings = {
      ...normalizedSettings,
      ageIdentityPath: normalizedSettings.ageIdentityPath.trim() ? fileSystem.resolvePath(vaultPath, normalizedSettings.ageIdentityPath) : "",
      ageRecipientPath: normalizedSettings.ageRecipientPath.trim() ? fileSystem.resolvePath(vaultPath, normalizedSettings.ageRecipientPath) : "",
    };
    return new ResolvedConfig(
      normalizedSettings,
      vaultPath,
      this.platformBridge,
      this.namingFactory.create(strategySettings, this.platformBridge.getUserInteraction()),
      this.encryptionFactory.create(strategySettings, fileSystem),
      this.remoteFactory.create(strategySettings),
      this.archiveFactory.create(),
      this.versionControlFactory.create(strategySettings),
    );
  }
}
