import {
  BackupRepository,
  FileProxy,
  FileSystem,
  FileSystemEntity,
  FolderProxy,
  ProcessResult,
  ProcessRunner,
} from "./domain";

const childProcess = require("node:child_process") as {
  execFile(command: string, args: string[], options: object, callback: (error: { code?: number | string; message: string } | null, stdout: string, stderr: string) => void): void;
};
const fs = require("node:fs") as any;
const path = require("node:path") as any;

export class NodeFile implements FileProxy {
  constructor(public readonly path: string) {}

  async read(): Promise<Uint8Array> {
    return fs.promises.readFile(this.path);
  }
}

export class NodeFolder implements FolderProxy {
  constructor(public readonly path: string) {}

  async getContents(): Promise<Iterable<FileSystemEntity>> {
    const entries = await fs.promises.readdir(this.path, { withFileTypes: true });
    return entries.map((entry: any) => {
      const entryPath = path.join(this.path, entry.name);
      return entry.isDirectory() ? new NodeFolder(entryPath) : new NodeFile(entryPath);
    });
  }
}

export class NodeFileSystem implements FileSystem {
  file(filePath: string): FileProxy { return new NodeFile(filePath); }
  folder(folderPath: string): FolderProxy { return new NodeFolder(folderPath); }

  async exists(entityPath: string): Promise<boolean> {
    try { await fs.promises.access(entityPath); return true; } catch { return false; }
  }

  async ensureFolder(folderPath: string): Promise<void> {
    await fs.promises.mkdir(folderPath, { recursive: true });
  }

  async listFiles(folderPath: string): Promise<FileProxy[]> {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    return entries.filter((entry: any) => entry.isFile()).map((entry: any) => new NodeFile(path.join(folderPath, entry.name)));
  }

  async copy(source: string, destination: string): Promise<void> {
    await fs.promises.copyFile(source, destination);
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      await fs.promises.rename(source, destination);
    } catch (error) {
      if ((error as { code?: string }).code !== "EXDEV") throw error;
      await fs.promises.copyFile(source, destination);
      await fs.promises.unlink(source);
    }
  }

  async remove(entityPath: string): Promise<void> {
    await fs.promises.rm(entityPath, { force: true });
  }
}

export class NodeProcessRunner implements ProcessRunner {
  async run(command: string, args: string[], cwd?: string): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const currentPath = process.env.PATH || "";
      const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", currentPath].filter(Boolean).join(":"), };
      childProcess.execFile(command, args, { cwd, env, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) { resolve({ stdout, stderr, exitCode: 0 }); return; }
        const code = typeof error.code === "number" ? error.code : 1;
        reject(new Error(`${command} failed (${code}): ${(stderr || error.message).trim()}`));
      });
    });
  }

  async available(command: string): Promise<boolean> {
    try { await this.run(command, ["--version"]); return true; } catch { return false; }
  }
}

export class GitBackupRepository implements BackupRepository {
  constructor(private readonly runner: ProcessRunner) {}

  async ensureRepository(repository: FolderProxy): Promise<void> {
    try {
      const topLevel = (await this.runner.run("git", ["rev-parse", "--show-toplevel"], repository.path)).stdout.trim();
      if (path.resolve(topLevel) !== path.resolve(repository.path)) await this.runner.run("git", ["init"], repository.path);
    } catch {
      await this.runner.run("git", ["init"], repository.path);
    }
  }

  async commitAll(repository: FolderProxy, message: string): Promise<boolean> {
    await this.runner.run("git", ["add", "-A"], repository.path);
    try {
      await this.runner.run("git", ["diff", "--cached", "--quiet"], repository.path);
      return false;
    } catch {
      await this.runner.run("git", ["commit", "-m", message], repository.path);
      return true;
    }
  }
}

export const nodePath = path;
