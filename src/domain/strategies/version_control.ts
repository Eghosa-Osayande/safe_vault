import type { FolderProxy } from "../file_system";

export interface VersionControlStrategy {
  ensureInitialized(directory: FolderProxy): Promise<void>;
  commitAll(directory: FolderProxy, message: string): Promise<boolean>;
}
