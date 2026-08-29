import { Command, CommandContext, FileProxy } from "./domain";
import { nodePath as path } from "./node-adapters";

const os = require("node:os") as { tmpdir(): string };

function tempPath(directory: string, suffix: string): string {
  return path.join(directory, `.obsidian-vault-backup-${Date.now()}-${Math.random().toString(16).slice(2)}${suffix}`);
}

export class BackupCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const { config, fileSystem, repository, ui } = context;
    await config.validate();
    const backup = config.getBackupDirectory();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    const vault = config.getVaultDirectory();
    const naming = config.getNamingStrategy();
    const encryption = config.getEncryptionStrategy();
    const baseName = await naming.nextArchiveName({ vaultName: path.basename(vault.path), now: new Date() });
    const finalPath = path.join(backup.path, `${baseName}.tar.gz${encryption.extension}`);

    if (naming.replacementMode === "delete-first" && await fileSystem.exists(finalPath)) {
      await fileSystem.remove(finalPath);
      await repository.commitAll(gitDirectory, `Delete previous backup ${path.basename(finalPath)}`);
    }

    const temporaryArchive = tempPath(os.tmpdir(), ".tar.gz");
    const temporaryOutput = encryption.extension ? `${temporaryArchive}${encryption.extension}` : temporaryArchive;
    try {
      const archive = await config.getArchiveStrategy().createArchive(vault, temporaryArchive, config.getExcludedPaths());
      const encrypted = await encryption.encryptFile(archive, temporaryOutput);
      if (await fileSystem.exists(finalPath)) await fileSystem.remove(finalPath);
      await fileSystem.move(encrypted.path, finalPath);
    } finally {
      await fileSystem.remove(temporaryArchive);
      await fileSystem.remove(temporaryOutput);
    }

    const committed = await repository.commitAll(gitDirectory, `Create backup ${path.basename(finalPath)}`);
    ui.notice(committed ? `Backup created: ${path.basename(finalPath)}` : "Backup archive was unchanged.", 5000);
  }
}

export class PushCommand implements Command {
  async invoke({ config, repository, ui }: CommandContext): Promise<void> {
    await config.validate();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    await config.getRemoteStrategy().push(gitDirectory);
    ui.notice("Backup repository pushed.");
  }
}

export class PullCommand implements Command {
  async invoke({ config, repository, ui }: CommandContext): Promise<void> {
    await config.validate();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    await config.getRemoteStrategy().pull(gitDirectory);
    ui.notice("Backup repository pulled.");
  }
}

export class FullBackupCommand implements Command {
  constructor(private readonly backup = new BackupCommand(), private readonly push = new PushCommand()) { }
  async invoke(context: CommandContext): Promise<void> {
    await this.backup.invoke(context);
    await this.push.invoke(context);
  }
}

export class RestoreCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const { config, fileSystem, ui } = context;
    await config.validate();
    const archives = (await fileSystem.listFiles(config.getBackupDirectory().path))
      .filter((file) => !path.basename(file.path).startsWith("."))
      .sort((left, right) => path.basename(right.path).localeCompare(path.basename(left.path)));
    if (!archives.length) throw new Error("No backup archives were found.");
    const selection = await ui.chooseRestore(archives);
    if (!selection) return;
    const destinationPath = path.resolve(config.getVaultDirectory().path, selection.destination);
    const relative = path.relative(config.getVaultDirectory().path, destinationPath);
    if (!selection.destination.trim() || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Restore destination must be a folder inside the current vault.");
    await fileSystem.ensureFolder(destinationPath);
    const temporaryArchive = tempPath(os.tmpdir(), ".restore.tar.gz");
    let archive: FileProxy | null = null;
    try {
      archive = await config.getEncryptionStrategy().decryptFile(selection.archive, temporaryArchive);
      await config.getArchiveStrategy().restoreArchive(archive, fileSystem.folder(destinationPath));
    } finally {
      if (archive) await fileSystem.remove(archive.path);
      await fileSystem.remove(temporaryArchive);
    }
    ui.notice(`Backup restored into ${selection.destination}.`, 5000);
  }
}

export class ConfigureBackupCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const configured = await context.ui.configure(context.config.getSettings());
    if (!configured) return;
    await context.saveSettings(configured);
    context.ui.notice("Backup configuration saved.");
  }
}
