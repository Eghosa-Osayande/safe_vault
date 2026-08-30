import type { FileSystem } from "../file_system";
import type { ProcessRunner } from "../process_runner";
import type { UserInteraction } from "../user_interaction";

export interface PlatformBridge {
  getFileSystem(): FileSystem;
  getProcessRunner(): ProcessRunner;
  getUserInteraction(): UserInteraction;
}
