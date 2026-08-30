import type { FileProxy, FileSystem } from "../file_system";

export interface EncryptionStrategy {
  readonly extension: string;
  validate(): Promise<void>;
  encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy>;
  decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy>;
}

export interface EncryptionStrategyFactory {
  create(settings: import("../config").BackupSettings, fileSystem: FileSystem): EncryptionStrategy;
}
