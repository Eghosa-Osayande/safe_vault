import type { BackupSettings } from "../config";
import type { FileProxy } from "../file_system";

export interface UserInteraction {
  promptArchiveName(suggestedName: string): Promise<string | null>;
  chooseRestore(archives: FileProxy[]): Promise<{ archive: FileProxy; destination: string } | null>;
  configure(current: BackupSettings): Promise<BackupSettings | null>;
  notice(message: string, timeout?: number): void;
}
