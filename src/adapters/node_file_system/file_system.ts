import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FileProxy, FileSystem, FileSystemEntity, FolderProxy } from "../../domain/file_system";

let temporaryFileSequence = 0;

export class NodeFile implements FileProxy {
  constructor(public readonly path: string) {}

  async read(): Promise<Uint8Array> {
    return fs.readFile(this.path);
  }

  async write(contents: string | Uint8Array): Promise<void> {
    await fs.writeFile(this.path, contents);
  }
}

export class NodeFolder implements FolderProxy {
  constructor(public readonly path: string) {}

  async getContents(): Promise<Iterable<FileSystemEntity>> {
    const entries = await fs.readdir(this.path, { withFileTypes: true });
    return entries.map((entry) => {
      const entryPath = path.join(this.path, entry.name);
      return entry.isDirectory() ? new NodeFolder(entryPath) : new NodeFile(entryPath);
    });
  }
}

export class NodeFileSystem implements FileSystem {
  file(filePath: string): FileProxy { return new NodeFile(filePath); }
  folder(folderPath: string): FolderProxy { return new NodeFolder(folderPath); }

  temporaryFile(suffix: string): FileProxy {
    temporaryFileSequence += 1;
    const name = `.obsidian-vault-backup-${Date.now()}-${temporaryFileSequence}-${Math.random().toString(16).slice(2)}${suffix}`;
    return this.file(path.join(os.tmpdir(), name));
  }

  joinPath(...segments: string[]): string { return path.join(...segments); }
  resolvePath(...segments: string[]): string { return path.resolve(...segments); }
  relativePath(from: string, to: string): string { return path.relative(from, to); }
  baseName(entityPath: string): string { return path.basename(entityPath); }
  parentPath(entityPath: string): string { return path.dirname(entityPath); }
  isAbsolutePath(entityPath: string): boolean { return path.isAbsolute(entityPath); }

  async exists(entityPath: string): Promise<boolean> {
    try {
      await fs.access(entityPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureFolder(folderPath: string): Promise<void> {
    await fs.mkdir(folderPath, { recursive: true });
  }

  async listFiles(folderPath: string): Promise<FileProxy[]> {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => new NodeFile(path.join(folderPath, entry.name)));
  }

  async copy(source: string, destination: string): Promise<void> {
    await fs.copyFile(source, destination);
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      await fs.rename(source, destination);
    } catch (error) {
      if ((error as { code?: string }).code !== "EXDEV") throw error;
      await fs.copyFile(source, destination);
      await fs.unlink(source);
    }
  }

  async remove(entityPath: string): Promise<void> {
    await fs.rm(entityPath, { force: true });
  }
}
