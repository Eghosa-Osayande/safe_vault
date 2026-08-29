"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigureBackupCommand = exports.RestoreCommand = exports.FullBackupCommand = exports.PullCommand = exports.PushCommand = exports.BackupCommand = void 0;
const node_adapters_1 = require("./node-adapters");
const os = require("node:os");
function tempPath(directory, suffix) {
    return node_adapters_1.nodePath.join(directory, `.obsidian-vault-backup-${Date.now()}-${Math.random().toString(16).slice(2)}${suffix}`);
}
class BackupCommand {
    async invoke(context) {
        const { config, fileSystem, repository, ui } = context;
        await config.validate();
        const backup = config.getBackupDirectory();
        const gitDirectory = config.getBackupGitDirectory();
        await repository.ensureRepository(gitDirectory);
        const vault = config.getVaultDirectory();
        const naming = config.getNamingStrategy();
        const encryption = config.getEncryptionStrategy();
        const baseName = await naming.nextArchiveName({ vaultName: node_adapters_1.nodePath.basename(vault.path), now: new Date() });
        const finalPath = node_adapters_1.nodePath.join(backup.path, `${baseName}.tar.gz${encryption.extension}`);
        if (naming.replacementMode === "delete-first" && await fileSystem.exists(finalPath)) {
            await fileSystem.remove(finalPath);
            await repository.commitAll(gitDirectory, `Delete previous backup ${node_adapters_1.nodePath.basename(finalPath)}`);
        }
        const temporaryArchive = tempPath(os.tmpdir(), ".tar.gz");
        const temporaryOutput = encryption.extension ? `${temporaryArchive}${encryption.extension}` : temporaryArchive;
        try {
            const archive = await config.getArchiveStrategy().createArchive(vault, temporaryArchive, config.getExcludedPaths());
            const encrypted = await encryption.encryptFile(archive, temporaryOutput);
            if (await fileSystem.exists(finalPath))
                await fileSystem.remove(finalPath);
            await fileSystem.move(encrypted.path, finalPath);
        }
        finally {
            await fileSystem.remove(temporaryArchive);
            await fileSystem.remove(temporaryOutput);
        }
        const committed = await repository.commitAll(gitDirectory, `Create backup ${node_adapters_1.nodePath.basename(finalPath)}`);
        ui.notice(committed ? `Backup created: ${node_adapters_1.nodePath.basename(finalPath)}` : "Backup archive was unchanged.", 5000);
    }
}
exports.BackupCommand = BackupCommand;
class PushCommand {
    async invoke({ config, repository, ui }) {
        await config.validate();
        const gitDirectory = config.getBackupGitDirectory();
        await repository.ensureRepository(gitDirectory);
        await config.getRemoteStrategy().push(gitDirectory);
        ui.notice("Backup repository pushed.");
    }
}
exports.PushCommand = PushCommand;
class PullCommand {
    async invoke({ config, repository, ui }) {
        await config.validate();
        const gitDirectory = config.getBackupGitDirectory();
        await repository.ensureRepository(gitDirectory);
        await config.getRemoteStrategy().pull(gitDirectory);
        ui.notice("Backup repository pulled.");
    }
}
exports.PullCommand = PullCommand;
class FullBackupCommand {
    constructor(backup = new BackupCommand(), push = new PushCommand()) {
        this.backup = backup;
        this.push = push;
    }
    async invoke(context) {
        await this.backup.invoke(context);
        await this.push.invoke(context);
    }
}
exports.FullBackupCommand = FullBackupCommand;
class RestoreCommand {
    async invoke(context) {
        const { config, fileSystem, ui } = context;
        await config.validate();
        const archives = (await fileSystem.listFiles(config.getBackupDirectory().path))
            .filter((file) => !node_adapters_1.nodePath.basename(file.path).startsWith("."))
            .sort((left, right) => node_adapters_1.nodePath.basename(right.path).localeCompare(node_adapters_1.nodePath.basename(left.path)));
        if (!archives.length)
            throw new Error("No backup archives were found.");
        const selection = await ui.chooseRestore(archives);
        if (!selection)
            return;
        const destinationPath = node_adapters_1.nodePath.resolve(config.getVaultDirectory().path, selection.destination);
        const relative = node_adapters_1.nodePath.relative(config.getVaultDirectory().path, destinationPath);
        if (!selection.destination.trim() || relative.startsWith("..") || node_adapters_1.nodePath.isAbsolute(relative))
            throw new Error("Restore destination must be a folder inside the current vault.");
        await fileSystem.ensureFolder(destinationPath);
        const temporaryArchive = tempPath(os.tmpdir(), ".restore.tar.gz");
        let archive = null;
        try {
            archive = await config.getEncryptionStrategy().decryptFile(selection.archive, temporaryArchive);
            await config.getArchiveStrategy().restoreArchive(archive, fileSystem.folder(destinationPath));
        }
        finally {
            if (archive)
                await fileSystem.remove(archive.path);
            await fileSystem.remove(temporaryArchive);
        }
        ui.notice(`Backup restored into ${selection.destination}.`, 5000);
    }
}
exports.RestoreCommand = RestoreCommand;
class ConfigureBackupCommand {
    async invoke(context) {
        const configured = await context.ui.configure(context.config.getSettings());
        if (!configured)
            return;
        await context.saveSettings(configured);
        context.ui.notice("Backup configuration saved.");
    }
}
exports.ConfigureBackupCommand = ConfigureBackupCommand;
