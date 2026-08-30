import type { App } from "obsidian";
import type { FileSystem } from "../../domain/file_system";
import type { PlatformBridge } from "../../domain/platform_bridge";
import type { ProcessRunner } from "../../domain/process_runner";
import type { UserInteraction } from "../../domain/user_interaction";
import { NodeFileSystem } from "../node_file_system";
import { NodeProcessRunner } from "../node_process_runner";
import { ObsidianUserInteraction } from "../obsidian_user_interaction";

export class ObsidianDesktopPlatformBridge implements PlatformBridge {
  private readonly fileSystem = new NodeFileSystem();
  private readonly processRunner = new NodeProcessRunner();
  private readonly userInteraction: UserInteraction;

  constructor(app: App) {
    this.userInteraction = new ObsidianUserInteraction(app, this.fileSystem, this.processRunner);
  }

  getFileSystem(): FileSystem {
    return this.fileSystem;
  }

  getProcessRunner(): ProcessRunner {
    return this.processRunner;
  }

  getUserInteraction(): UserInteraction {
    return this.userInteraction;
  }
}
