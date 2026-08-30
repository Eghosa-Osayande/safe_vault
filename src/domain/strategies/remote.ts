import type { FolderProxy } from "../file_system";

export interface RemoteStrategy {
  push(repository: FolderProxy): Promise<void>;
  pull(repository: FolderProxy): Promise<void>;
}

export interface RemoteStrategyFactory {
  create(settings: import("../config").BackupSettings): RemoteStrategy;
}
