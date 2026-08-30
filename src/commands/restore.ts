import type { Command, CommandContext } from "../domain/commands";
import type { FileProxy } from "../domain/file_system";

export class RestoreCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const { config } = context;
    const platformBridge = config.getPlatformBridge();
    const fileSystem = platformBridge.getFileSystem();
    const ui = platformBridge.getUserInteraction();
    await config.validate();
    const archives = (await fileSystem.listFiles(config.getBackupDirectory().path))
      .filter((file) => !fileSystem.baseName(file.path).startsWith("."))
      .sort((left, right) => fileSystem.baseName(right.path).localeCompare(fileSystem.baseName(left.path)));
    if (!archives.length) throw new Error("No backup archives were found.");
    const selection = await ui.chooseRestore(archives);
    if (!selection) return;
    const destinationPath = fileSystem.resolvePath(config.getVaultDirectory().path, selection.destination);
    const relative = fileSystem.relativePath(config.getVaultDirectory().path, destinationPath);
    if (!selection.destination.trim() || relative.startsWith("..") || fileSystem.isAbsolutePath(relative)) {
      throw new Error("Restore destination must be a folder inside the current vault.");
    }
    await fileSystem.ensureFolder(destinationPath);
    const temporaryArchive = fileSystem.temporaryFile(".restore.tar.gz");
    let archive: FileProxy | null = null;
    try {
      archive = await config.getEncryptionStrategy().decryptFile(selection.archive, temporaryArchive.path);
      await config.getArchiveStrategy().restoreArchive(archive, fileSystem.folder(destinationPath));
    } finally {
      if (archive) await fileSystem.remove(archive.path);
      await fileSystem.remove(temporaryArchive.path);
    }
    ui.notice(`Backup restored into ${selection.destination}.`, 5000);
  }
}
