import type { BackupSettings } from "../domain/config";
import type { FolderProxy } from "../domain/file_system";
import type { RemoteStrategy } from "../domain/strategies";
import type { ProcessRunner } from "../domain/process_runner";

class NoRemoteStrategy implements RemoteStrategy {
  async push(): Promise<void> {
    throw new Error("No remote strategy is configured.");
  }

  async pull(): Promise<void> {
    throw new Error("No remote strategy is configured.");
  }
}

class GitRemoteStrategy implements RemoteStrategy {
  constructor(
    private readonly pullUrl: string,
    private readonly pushUrl: string,
    private readonly runner: ProcessRunner,
  ) {}

  private async configure(repository: FolderProxy): Promise<void> {
    if (!this.pullUrl.trim()) throw new Error("A Git remote pull URL is required.");
    let hasOrigin = true;
    try {
      await this.runner.run("git", ["remote", "get-url", "origin"], repository.path);
    } catch {
      hasOrigin = false;
    }
    if (hasOrigin) {
      await this.runner.run("git", ["remote", "set-url", "origin", this.pullUrl], repository.path);
    } else {
      await this.runner.run("git", ["remote", "add", "origin", this.pullUrl], repository.path);
    }
    await this.runner.run("git", ["remote", "set-url", "--push", "origin", this.pushUrl.trim() || this.pullUrl], repository.path);
  }

  async push(repository: FolderProxy): Promise<void> {
    await this.configure(repository);
    await this.runner.run("git", ["push", "-u", "origin", "HEAD"], repository.path);
  }

  async pull(repository: FolderProxy): Promise<void> {
    await this.configure(repository);
    const branch = (await this.runner.run("git", ["branch", "--show-current"], repository.path)).stdout.trim();
    if (!branch) throw new Error("The backup repository has no current branch to pull.");
    await this.runner.run("git", ["pull", "--ff-only", "origin", branch], repository.path);
  }
}

export class DefaultRemoteStrategyFactory {
  constructor(private readonly runner: ProcessRunner) {}

  create(settings: BackupSettings): RemoteStrategy {
    return settings.remoteStrategy === "git"
      ? new GitRemoteStrategy(settings.remotePullUrl, settings.remotePushUrl, this.runner)
      : new NoRemoteStrategy();
  }
}
