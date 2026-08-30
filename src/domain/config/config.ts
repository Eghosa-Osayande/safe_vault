import type { FolderProxy } from "../file_system";
import type { PlatformBridge } from "../platform_bridge";
import type { ArchiveStrategy, EncryptionStrategy, NamingStrategy, RemoteStrategy, VersionControlStrategy } from "../strategies";
import type { BackupSettings } from "./backup_settings";

export interface Config {
  getVaultDirectory(): FolderProxy;
  getBackupDirectory(): FolderProxy;
  getBackupGitDirectory(): FolderProxy;
  getEncryptionStrategy(): EncryptionStrategy;
  getRemoteStrategy(): RemoteStrategy;
  getNamingStrategy(): NamingStrategy;
  getArchiveStrategy(): ArchiveStrategy;
  getVersionControlStrategy(): VersionControlStrategy;
  getPlatformBridge(): PlatformBridge;
  getExcludedPaths(): string[];
  getSettings(): BackupSettings;
  validate(requireBackup?: boolean): Promise<void>;
}

export interface ConfigFactory {
  create(settings: BackupSettings): Config;
}
