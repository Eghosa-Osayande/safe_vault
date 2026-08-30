import type { BackupSettings, Config, ConfigFactory } from "../domain/config";
import type { FolderProxy } from "../domain/file_system";
import type { PlatformBridge } from "../domain/platform_bridge";
import type { ArchiveStrategy, EncryptionStrategy, NamingStrategy, RemoteStrategy, VersionControlStrategy } from "../domain/strategies";
import {
  DefaultEncryptionStrategyFactory,
  DefaultNamingStrategyFactory,
  DefaultRemoteStrategyFactory,
  GitVersionControlStrategy,
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

  getBackupGitDirectory(): FolderProxy {
    return this.platformBridge.getFileSystem().folder(this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory));
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
    const excluded = this.settings.excludedVaultPaths.map((item) => item.trim()).filter(Boolean);
    if (this.settings.excludeVaultGit && !excluded.includes(".git")) excluded.push(".git");
    return excluded;
  }

  async validate(requireBackup = true): Promise<void> {
    const fileSystem = this.platformBridge.getFileSystem();
    const runner = this.platformBridge.getProcessRunner();
    if (!(await runner.available("git"))) throw new Error("git is not installed or is not available on PATH.");
    if (!(await runner.available("tar"))) throw new Error("tar is not installed or is not available on PATH.");
    if (!(await fileSystem.exists(this.vaultPath))) throw new Error(`Vault directory does not exist: ${this.vaultPath}`);
    if (!this.settings.backupDirectory.trim()) {
      if (requireBackup) throw new Error("No backup directory is configured. Run Configure backup first.");
      return;
    }
    const backup = this.resolveSettingPath(this.settings.backupDirectory);
    const repository = this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory);
    const relative = fileSystem.relativePath(repository, backup);
    if (relative.startsWith("..") || fileSystem.isAbsolutePath(relative)) throw new Error("The backup Git directory must be the backup directory or one of its parent directories.");
    const vaultToRepository = fileSystem.relativePath(this.vaultPath, repository);
    const repositoryToVault = fileSystem.relativePath(repository, this.vaultPath);
    const isInside = (relativePath: string) => relativePath === "" || (!relativePath.startsWith("..") && !fileSystem.isAbsolutePath(relativePath));
    if (isInside(vaultToRepository) || isInside(repositoryToVault)) throw new Error("The vault and backup Git directory must not overlap.");
    await fileSystem.ensureFolder(repository);
    await fileSystem.ensureFolder(backup);
    await this.encryption.validate();
  }
}

export class DefaultConfigFactory implements ConfigFactory {
  private readonly namingFactory = new DefaultNamingStrategyFactory();
  private readonly encryptionFactory: DefaultEncryptionStrategyFactory;
  private readonly remoteFactory: DefaultRemoteStrategyFactory;
  private readonly archiveFactory: TarArchiveStrategyFactory;
  private readonly versionControl: VersionControlStrategy;

  constructor(
    private readonly currentVaultPath: string,
    private readonly platformBridge: PlatformBridge,
  ) {
    const runner = platformBridge.getProcessRunner();
    const fileSystem = platformBridge.getFileSystem();
    this.encryptionFactory = new DefaultEncryptionStrategyFactory(runner);
    this.remoteFactory = new DefaultRemoteStrategyFactory(runner);
    this.archiveFactory = new TarArchiveStrategyFactory(runner, fileSystem);
    this.versionControl = new GitVersionControlStrategy(runner, fileSystem);
  }

  create(settings: BackupSettings): Config {
    const fileSystem = this.platformBridge.getFileSystem();
    const vaultPath = fileSystem.resolvePath(settings.vaultDirectory.trim() || this.currentVaultPath);
    const strategySettings = {
      ...settings,
      ageIdentityPath: settings.ageIdentityPath.trim() ? fileSystem.resolvePath(vaultPath, settings.ageIdentityPath) : "",
    };
    return new ResolvedConfig(
      settings,
      vaultPath,
      this.platformBridge,
      this.namingFactory.create(strategySettings, this.platformBridge.getUserInteraction()),
      this.encryptionFactory.create(strategySettings, fileSystem),
      this.remoteFactory.create(strategySettings),
      this.archiveFactory.create(),
      this.versionControl,
    );
  }
}
