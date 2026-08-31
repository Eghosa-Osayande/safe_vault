import { access, copyFile, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { FileProxy, FileSystem, FileSystemEntity, FolderProxy } from "../../domain/file_system";

let temporaryFileSequence = 0;

export class NodeFile implements FileProxy {
  constructor(public readonly path: string) {}

  async read(): Promise<Uint8Array> {
    const contents: Uint8Array = await readFile(this.path);
    return contents;
  }

  async write(contents: string | Uint8Array): Promise<void> {
    await writeFile(this.path, contents);
  }
}

export class NodeFolder implements FolderProxy {
  constructor(public readonly path: string) {}

  async getContents(): Promise<Iterable<FileSystemEntity>> {
    const entries = await readdir(this.path, { withFileTypes: true });
    const contents: FileSystemEntity[] = entries.map((entry) => {
      const entryPath = join(this.path, entry.name);
      return entry.isDirectory() ? new NodeFolder(entryPath) : new NodeFile(entryPath);
    });
    return contents;
  }
}

export class NodeFileSystem implements FileSystem {
  file(filePath: string): FileProxy { return new NodeFile(filePath); }
  folder(folderPath: string): FolderProxy { return new NodeFolder(folderPath); }

  temporaryFile(suffix: string): FileProxy {
    temporaryFileSequence += 1;
    const name = `.obsidian-vault-backup-${Date.now()}-${temporaryFileSequence}-${Math.random().toString(16).slice(2)}${suffix}`;
    const temporaryPath: string = join(tmpdir(), name);
    return this.file(temporaryPath);
  }

  joinPath(...segments: string[]): string {
    const joinedPath: string = join(...segments);
    return joinedPath;
  }

  resolvePath(...segments: string[]): string {
    const resolvedPath: string = resolve(...segments);
    return resolvedPath;
  }

  relativePath(from: string, to: string): string {
    const relativePath: string = relative(from, to);
    return relativePath;
  }

  baseName(entityPath: string): string {
    const fileName: string = basename(entityPath);
    return fileName;
  }

  parentPath(entityPath: string): string {
    const parentPath: string = dirname(entityPath);
    return parentPath;
  }

  isAbsolutePath(entityPath: string): boolean {
    const absolutePath = isAbsolute(entityPath);
    return absolutePath;
  }

  async exists(entityPath: string): Promise<boolean> {
    try {
      await access(entityPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureFolder(folderPath: string): Promise<void> {
    await mkdir(folderPath, { recursive: true });
  }

  async listFiles(folderPath: string): Promise<FileProxy[]> {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const files: FileProxy[] = entries
      .filter((entry) => entry.isFile())
      .map((entry) => new NodeFile(join(folderPath, entry.name)));
    return files;
  }

  async copy(source: string, destination: string): Promise<void> {
    await copyFile(source, destination);
  }

  async move(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination);
    } catch (error) {
      if ((error as { code?: string }).code !== "EXDEV") throw error;
      await copyFile(source, destination);
      await unlink(source);
    }
  }

  async remove(entityPath: string): Promise<void> {
    await rm(entityPath, { force: true });
  }
}
