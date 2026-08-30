import type { Command, CommandContext } from "../domain/commands";

export class BackupCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const { config } = context;
    const platformBridge = config.getPlatformBridge();
    const fileSystem = platformBridge.getFileSystem();
    const ui = platformBridge.getUserInteraction();
    const versionControlStrategy = config.getVersionControlStrategy();
    await config.validate();
    const backup = config.getBackupDirectory();
    const versionControlDirectory = config.getBackupDirectory();
    await versionControlStrategy.ensureInitialized(versionControlDirectory);
    const vault = config.getVaultDirectory();
    const naming = config.getNamingStrategy();
    const encryption = config.getEncryptionStrategy();
    const baseName = await naming.nextArchiveName({ vaultName: fileSystem.baseName(vault.path), now: new Date() });
    const finalPath = fileSystem.joinPath(backup.path, `${baseName}.tar.gz${encryption.extension}`);

    if (naming.replacementMode === "delete-first" && await fileSystem.exists(finalPath)) {
      await fileSystem.remove(finalPath);
      await versionControlStrategy.commitAll(versionControlDirectory, `Delete previous backup ${fileSystem.baseName(finalPath)}`);
    }

    const temporaryArchive = fileSystem.temporaryFile(".tar.gz");
    const temporaryOutput = encryption.extension
      ? fileSystem.file(`${temporaryArchive.path}${encryption.extension}`)
      : temporaryArchive;
    try {
      const archive = await config.getArchiveStrategy().createArchive(vault, temporaryArchive.path, config.getExcludedPaths());
      const encrypted = await encryption.encryptFile(archive, temporaryOutput.path);
      if (await fileSystem.exists(finalPath)) await fileSystem.remove(finalPath);
      await fileSystem.move(encrypted.path, finalPath);
    } finally {
      await fileSystem.remove(temporaryArchive.path);
      await fileSystem.remove(temporaryOutput.path);
    }

    const committed = await versionControlStrategy.commitAll(versionControlDirectory, `Create backup ${fileSystem.baseName(finalPath)}`);
    const versionControlDisabled = config.getSettings().versionControlStrategy === "none";
    ui.notice(
      committed || versionControlDisabled ? `Backup created: ${fileSystem.baseName(finalPath)}` : "Backup archive was unchanged.",
      5000,
    );
  }
}
