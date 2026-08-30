export interface FileSystemEntity {
  readonly path: string;
}

export interface FileProxy extends FileSystemEntity {
  read(): Promise<Uint8Array>;
  write(contents: string | Uint8Array): Promise<void>;
}

export interface FolderProxy extends FileSystemEntity {
  getContents(): Promise<Iterable<FileSystemEntity>>;
}

export interface FileSystem {
  file(path: string): FileProxy;
  folder(path: string): FolderProxy;
  temporaryFile(suffix: string): FileProxy;
  joinPath(...segments: string[]): string;
  resolvePath(...segments: string[]): string;
  relativePath(from: string, to: string): string;
  baseName(path: string): string;
  parentPath(path: string): string;
  isAbsolutePath(path: string): boolean;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
  listFiles(path: string): Promise<FileProxy[]>;
  copy(source: string, destination: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
}
