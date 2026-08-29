import {
  ArchiveStrategy,
  ArchiveStrategyFactory,
  BackupSettings,
  Config,
  ConfigFactory,
  EncryptionStrategy,
  EncryptionStrategyFactory,
  FileSystem,
  FolderProxy,
  NamingStrategy,
  NamingStrategyFactory,
  ProcessRunner,
  RemoteStrategy,
  RemoteStrategyFactory,
  UserInteraction,
} from "./domain";
import { nodePath as path } from "./node-adapters";

class ResolvedConfig implements Config {
  constructor(
    private readonly settings: BackupSettings,
    private readonly vaultPath: string,
    private readonly fileSystem: FileSystem,
    private readonly naming: NamingStrategy,
    private readonly encryption: EncryptionStrategy,
    private readonly remote: RemoteStrategy,
    private readonly archive: ArchiveStrategy,
    private readonly runner: ProcessRunner,
  ) {}

  private resolveSettingPath(value: string): string {
    return path.resolve(this.vaultPath, value);
  }

  getVaultDirectory(): FolderProxy { return this.fileSystem.folder(this.vaultPath); }
  getBackupDirectory(): FolderProxy { return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupDirectory)); }
  getBackupGitDirectory(): FolderProxy { return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory)); }
  getEncryptionStrategy(): EncryptionStrategy { return this.encryption; }
  getRemoteStrategy(): RemoteStrategy { return this.remote; }
  getNamingStrategy(): NamingStrategy { return this.naming; }
  getArchiveStrategy(): ArchiveStrategy { return this.archive; }
  getSettings(): BackupSettings { return { ...this.settings, excludedVaultPaths: [...this.settings.excludedVaultPaths] }; }
  getExcludedPaths(): string[] {
    const excluded = this.settings.excludedVaultPaths.map((item) => item.trim()).filter(Boolean);
    if (this.settings.excludeVaultGit && !excluded.includes(".git")) excluded.push(".git");
    return excluded;
  }

  async validate(requireBackup = true): Promise<void> {
    if (!(await this.runner.available("git"))) throw new Error("git is not installed or is not available on PATH.");
    if (!(await this.runner.available("tar"))) throw new Error("tar is not installed or is not available on PATH.");
    if (!(await this.fileSystem.exists(this.vaultPath))) throw new Error(`Vault directory does not exist: ${this.vaultPath}`);
    if (!this.settings.backupDirectory.trim()) {
      if (requireBackup) throw new Error("No backup directory is configured. Run Configure backup first.");
      return;
    }
    const backup = this.resolveSettingPath(this.settings.backupDirectory);
    const repository = this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory);
    const relative = path.relative(repository, backup);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The backup Git directory must be the backup directory or one of its parent directories.");
    const vaultToRepository = path.relative(this.vaultPath, repository);
    const repositoryToVault = path.relative(repository, this.vaultPath);
    const isInside = (relativePath: string) => relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    if (isInside(vaultToRepository) || isInside(repositoryToVault)) throw new Error("The vault and backup Git directory must not overlap.");
    await this.fileSystem.ensureFolder(repository);
    await this.fileSystem.ensureFolder(backup);
    await this.encryption.validate();
  }
}

export class DefaultConfigFactory implements ConfigFactory {
  constructor(
    private readonly currentVaultPath: string,
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
    private readonly ui: UserInteraction,
    private readonly namingFactory: NamingStrategyFactory,
    private readonly encryptionFactory: EncryptionStrategyFactory,
    private readonly remoteFactory: RemoteStrategyFactory,
    private readonly archiveFactory: ArchiveStrategyFactory,
  ) {}

  create(settings: BackupSettings): Config {
    const vaultPath = path.resolve(settings.vaultDirectory.trim() || this.currentVaultPath);
    const strategySettings = {
      ...settings,
      ageIdentityPath: settings.ageIdentityPath.trim() ? path.resolve(vaultPath, settings.ageIdentityPath) : "",
    };
    return new ResolvedConfig(
      settings,
      vaultPath,
      this.fileSystem,
      this.namingFactory.create(strategySettings, this.ui),
      this.encryptionFactory.create(strategySettings, this.fileSystem, this.runner),
      this.remoteFactory.create(strategySettings, this.runner),
      this.archiveFactory.create(this.runner),
      this.runner,
    );
  }
}
