export type NamingStrategyKind = "same-delete" | "same-overwrite" | "dated" | "custom";
export type EncryptionStrategyKind = "none" | "age";
export type RemoteStrategyKind = "none" | "git";

export interface BackupSettings {
  vaultDirectory: string;
  backupDirectory: string;
  backupGitDirectory: string;
  excludedVaultPaths: string[];
  excludeVaultGit: boolean;
  namingStrategy: NamingStrategyKind;
  sameArchiveName: string;
  dateFormat: string;
  encryptionStrategy: EncryptionStrategyKind;
  ageRecipient: string;
  ageIdentityPath: string;
  remoteStrategy: RemoteStrategyKind;
  remotePullUrl: string;
  remotePushUrl: string;
}

export const DEFAULT_SETTINGS: BackupSettings = {
  vaultDirectory: "",
  backupDirectory: "",
  backupGitDirectory: "",
  excludedVaultPaths: [],
  excludeVaultGit: true,
  namingStrategy: "dated",
  sameArchiveName: "vault-backup",
  dateFormat: "YYYY-MM-DD_HH-mm-ss",
  encryptionStrategy: "age",
  ageRecipient: "",
  ageIdentityPath: "",
  remoteStrategy: "none",
  remotePullUrl: "",
  remotePushUrl: "",
};

export interface FileSystemEntity {
  readonly path: string;
}

export interface FileProxy extends FileSystemEntity {
  read(): Promise<Uint8Array>;
}

export interface FolderProxy extends FileSystemEntity {
  getContents(): Promise<Iterable<FileSystemEntity>>;
}

export interface FileSystem {
  file(path: string): FileProxy;
  folder(path: string): FolderProxy;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
  listFiles(path: string): Promise<FileProxy[]>;
  copy(source: string, destination: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(command: string, args: string[], cwd?: string): Promise<ProcessResult>;
  available(command: string): Promise<boolean>;
}

export interface UserInteraction {
  promptArchiveName(suggestedName: string): Promise<string | null>;
  chooseRestore(archives: FileProxy[]): Promise<{ archive: FileProxy; destination: string } | null>;
  configure(current: BackupSettings): Promise<BackupSettings | null>;
  notice(message: string, timeout?: number): void;
}

export interface NamingContext {
  vaultName: string;
  now: Date;
}

export interface NamingStrategy {
  readonly replacementMode: "delete-first" | "overwrite" | "unique";
  nextArchiveName(context: NamingContext): Promise<string>;
}

export interface EncryptionStrategy {
  readonly extension: string;
  validate(): Promise<void>;
  encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy>;
  decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy>;
}

export interface ArchiveStrategy {
  createArchive(source: FolderProxy, destinationPath: string, excludedPaths: string[]): Promise<FileProxy>;
  restoreArchive(archive: FileProxy, destination: FolderProxy): Promise<void>;
}

export interface RemoteStrategy {
  push(repository: FolderProxy): Promise<void>;
  pull(repository: FolderProxy): Promise<void>;
}

export interface BackupRepository {
  ensureRepository(repository: FolderProxy): Promise<void>;
  commitAll(repository: FolderProxy, message: string): Promise<boolean>;
}

export interface NamingStrategyFactory {
  create(settings: BackupSettings, ui: UserInteraction): NamingStrategy;
}

export interface EncryptionStrategyFactory {
  create(settings: BackupSettings, fileSystem: FileSystem, runner: ProcessRunner): EncryptionStrategy;
}

export interface RemoteStrategyFactory {
  create(settings: BackupSettings, runner: ProcessRunner): RemoteStrategy;
}

export interface ArchiveStrategyFactory {
  create(runner: ProcessRunner): ArchiveStrategy;
}

export interface Config {
  getVaultDirectory(): FolderProxy;
  getBackupDirectory(): FolderProxy;
  getBackupGitDirectory(): FolderProxy;
  getEncryptionStrategy(): EncryptionStrategy;
  getRemoteStrategy(): RemoteStrategy;
  getNamingStrategy(): NamingStrategy;
  getArchiveStrategy(): ArchiveStrategy;
  getExcludedPaths(): string[];
  getSettings(): BackupSettings;
  validate(requireBackup?: boolean): Promise<void>;
}

export interface ConfigFactory {
  create(settings: BackupSettings): Config;
}

export interface CommandContext {
  config: Config;
  fileSystem: FileSystem;
  repository: BackupRepository;
  ui: UserInteraction;
  saveSettings(settings: BackupSettings): Promise<void>;
}

export interface Command {
  invoke(context: CommandContext): Promise<void>;
}
