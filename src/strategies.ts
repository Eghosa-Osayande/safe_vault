import {
  ArchiveStrategy,
  ArchiveStrategyFactory,
  BackupSettings,
  EncryptionStrategy,
  EncryptionStrategyFactory,
  FileProxy,
  FileSystem,
  FolderProxy,
  NamingContext,
  NamingStrategy,
  NamingStrategyFactory,
  ProcessRunner,
  RemoteStrategy,
  RemoteStrategyFactory,
  UserInteraction,
} from "./domain";
import { nodePath as path } from "./node-adapters";

function safeName(value: string): string {
  const cleaned = value.trim().replace(/\.tar\.gz(?:\.age)?$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Archive name must contain at least one letter or number.");
  return cleaned;
}

function formatDate(date: Date, format: string): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    HH: String(date.getHours()).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ss: String(date.getSeconds()).padStart(2, "0"),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}

class FixedNamingStrategy implements NamingStrategy {
  constructor(private readonly name: string, public readonly replacementMode: "delete-first" | "overwrite") {}
  async nextArchiveName(): Promise<string> { return safeName(this.name); }
}

class DatedNamingStrategy implements NamingStrategy {
  readonly replacementMode = "unique" as const;
  constructor(private readonly format: string) {}
  async nextArchiveName(context: NamingContext): Promise<string> {
    return `${safeName(context.vaultName)}-${safeName(formatDate(context.now, this.format))}`;
  }
}

class CustomNamingStrategy implements NamingStrategy {
  readonly replacementMode = "unique" as const;
  constructor(private readonly ui: UserInteraction) {}
  async nextArchiveName(context: NamingContext): Promise<string> {
    const value = await this.ui.promptArchiveName(`${context.vaultName}-backup`);
    if (value === null) throw new Error("Backup cancelled.");
    return safeName(value);
  }
}

export class DefaultNamingStrategyFactory implements NamingStrategyFactory {
  create(settings: BackupSettings, ui: UserInteraction): NamingStrategy {
    switch (settings.namingStrategy) {
      case "same-delete": return new FixedNamingStrategy(settings.sameArchiveName, "delete-first");
      case "same-overwrite": return new FixedNamingStrategy(settings.sameArchiveName, "overwrite");
      case "custom": return new CustomNamingStrategy(ui);
      default: return new DatedNamingStrategy(settings.dateFormat);
    }
  }
}

class NoEncryptionStrategy implements EncryptionStrategy {
  readonly extension = "";
  constructor(private readonly fileSystem: FileSystem) {}
  async validate(): Promise<void> {}
  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.fileSystem.move(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }
  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.fileSystem.copy(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }
}

class AgeEncryptionStrategy implements EncryptionStrategy {
  readonly extension = ".age";
  constructor(private readonly recipient: string, private readonly identityPath: string, private readonly fileSystem: FileSystem, private readonly runner: ProcessRunner) {}
  async validate(): Promise<void> {
    if (!this.recipient.trim()) throw new Error("An age recipient is required for encrypted backups.");
    if (!(await this.runner.available("age"))) throw new Error("age is not installed or is not available on PATH.");
  }
  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.runner.run("age", ["-r", this.recipient, "-o", destinationPath, source.path]);
    await this.fileSystem.remove(source.path);
    return this.fileSystem.file(destinationPath);
  }
  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    if (!this.identityPath.trim()) throw new Error("An age identity path is required to restore an encrypted backup.");
    await this.runner.run("age", ["-d", "-i", this.identityPath, "-o", destinationPath, source.path]);
    return this.fileSystem.file(destinationPath);
  }
}

export class DefaultEncryptionStrategyFactory implements EncryptionStrategyFactory {
  create(settings: BackupSettings, fileSystem: FileSystem, runner: ProcessRunner): EncryptionStrategy {
    return settings.encryptionStrategy === "age"
      ? new AgeEncryptionStrategy(settings.ageRecipient, settings.ageIdentityPath, fileSystem, runner)
      : new NoEncryptionStrategy(fileSystem);
  }
}

class TarArchiveStrategy implements ArchiveStrategy {
  constructor(private readonly runner: ProcessRunner) {}
  async createArchive(source: FolderProxy, destinationPath: string, excludedPaths: string[]): Promise<FileProxy> {
    const parent = path.dirname(source.path);
    const root = path.basename(source.path);
    const excludeArgs = excludedPaths.map((excluded) => `--exclude=${root}/${excluded.replace(/^\.?\//, "").replace(/\/$/, "")}`);
    await this.runner.run("tar", ["-czf", destinationPath, ...excludeArgs, "-C", parent, root]);
    return { path: destinationPath, read: async () => { const fs = require("node:fs") as any; return fs.promises.readFile(destinationPath); } };
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

export class TarArchiveStrategyFactory implements ArchiveStrategyFactory {
  create(runner: ProcessRunner): ArchiveStrategy { return new TarArchiveStrategy(runner); }
}

class NoRemoteStrategy implements RemoteStrategy {
  async push(): Promise<void> { throw new Error("No remote strategy is configured."); }
  async pull(): Promise<void> { throw new Error("No remote strategy is configured."); }
}

class GitRemoteStrategy implements RemoteStrategy {
  constructor(private readonly pullUrl: string, private readonly pushUrl: string, private readonly runner: ProcessRunner) {}

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

export class DefaultRemoteStrategyFactory implements RemoteStrategyFactory {
  create(settings: BackupSettings, runner: ProcessRunner): RemoteStrategy {
    return settings.remoteStrategy === "git"
      ? new GitRemoteStrategy(settings.remotePullUrl, settings.remotePushUrl, runner)
      : new NoRemoteStrategy();
  }
}
