import type { FileSystem, FolderProxy } from "../domain/file_system";
import type { ProcessRunner } from "../domain/process_runner";
import type { VersionControlStrategy } from "../domain/strategies";

export class GitVersionControlStrategy implements VersionControlStrategy {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly fileSystem: FileSystem,
  ) {}

  async ensureInitialized(directory: FolderProxy): Promise<void> {
    try {
      const topLevel = (await this.runner.run("git", ["rev-parse", "--show-toplevel"], directory.path)).stdout.trim();
      if (this.fileSystem.resolvePath(topLevel) !== this.fileSystem.resolvePath(directory.path)) {
        await this.runner.run("git", ["init"], directory.path);
      }
    } catch {
      await this.runner.run("git", ["init"], directory.path);
    }
  }

  async commitAll(directory: FolderProxy, message: string): Promise<boolean> {
    await this.runner.run("git", ["add", "-A"], directory.path);
    try {
      await this.runner.run("git", ["diff", "--cached", "--quiet"], directory.path);
      return false;
    } catch {
      await this.runner.run("git", ["commit", "-m", message], directory.path);
      return true;
    }
  }
}
