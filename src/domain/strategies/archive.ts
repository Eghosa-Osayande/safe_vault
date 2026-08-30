import type { FileProxy, FolderProxy } from "../file_system";

export interface ArchiveStrategy {
  createArchive(source: FolderProxy, destinationPath: string, excludedPaths: string[]): Promise<FileProxy>;
  restoreArchive(archive: FileProxy, destination: FolderProxy): Promise<void>;
}

export interface ArchiveStrategyFactory {
  create(): ArchiveStrategy;
}
