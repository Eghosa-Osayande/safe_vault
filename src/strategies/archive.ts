import type { FileProxy, FileSystem, FolderProxy } from "../domain/file_system";
import type { ArchiveStrategy } from "../domain/strategies";
import type { ProcessRunner } from "../domain/process_runner";

class TarArchiveStrategy implements ArchiveStrategy {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly fileSystem: FileSystem,
  ) {}

  async createArchive(source: FolderProxy, destinationPath: string, excludedPaths: string[]): Promise<FileProxy> {
    const parent = this.fileSystem.parentPath(source.path);
    const root = this.fileSystem.baseName(source.path);
    const excludeArgs = excludedPaths.map((excluded) => `--exclude=${root}/${excluded.replace(/^\.?\//, "").replace(/\/$/, "")}`);
    await this.runner.run("tar", ["-czf", destinationPath, ...excludeArgs, "-C", parent, root]);
    return this.fileSystem.file(destinationPath);
  }

  async restoreArchive(archive: FileProxy, destination: FolderProxy): Promise<void> {
    const listing = await this.runner.run("tar", ["-tzf", archive.path]);
    const unsafe = listing.stdout.split(/\r?\n/).filter(Boolean).find((entry) => {
      const normalized = entry.replace(/\\/g, "/");
      return normalized.startsWith("/") || normalized.split("/").includes("..");
    });
    if (unsafe) throw new Error(`Archive contains an unsafe path: ${unsafe}`);
    await this.runner.run("tar", ["-xzf", archive.path, "-C", destination.path]);
  }
}

export class TarArchiveStrategyFactory {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly fileSystem: FileSystem,
  ) {}

  create(): ArchiveStrategy {
    return new TarArchiveStrategy(this.runner, this.fileSystem);
  }
}
