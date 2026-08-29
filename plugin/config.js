"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultConfigFactory = void 0;
const node_adapters_1 = require("./node-adapters");
class ResolvedConfig {
    constructor(settings, vaultPath, fileSystem, naming, encryption, remote, archive, runner) {
        this.settings = settings;
        this.vaultPath = vaultPath;
        this.fileSystem = fileSystem;
        this.naming = naming;
        this.encryption = encryption;
        this.remote = remote;
        this.archive = archive;
        this.runner = runner;
    }
    resolveSettingPath(value) {
        return node_adapters_1.nodePath.resolve(this.vaultPath, value);
    }
    getVaultDirectory() { return this.fileSystem.folder(this.vaultPath); }
    getBackupDirectory() { return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupDirectory)); }
    getBackupGitDirectory() { return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory)); }
    getEncryptionStrategy() { return this.encryption; }
    getRemoteStrategy() { return this.remote; }
    getNamingStrategy() { return this.naming; }
    getArchiveStrategy() { return this.archive; }
    getSettings() { return { ...this.settings, excludedVaultPaths: [...this.settings.excludedVaultPaths] }; }
    getExcludedPaths() {
        const excluded = this.settings.excludedVaultPaths.map((item) => item.trim()).filter(Boolean);
        if (this.settings.excludeVaultGit && !excluded.includes(".git"))
            excluded.push(".git");
        return excluded;
    }
    async validate(requireBackup = true) {
        if (!(await this.runner.available("git")))
            throw new Error("git is not installed or is not available on PATH.");
        if (!(await this.runner.available("tar")))
            throw new Error("tar is not installed or is not available on PATH.");
        if (!(await this.fileSystem.exists(this.vaultPath)))
            throw new Error(`Vault directory does not exist: ${this.vaultPath}`);
        if (!this.settings.backupDirectory.trim()) {
            if (requireBackup)
                throw new Error("No backup directory is configured. Run Configure backup first.");
            return;
        }
        const backup = this.resolveSettingPath(this.settings.backupDirectory);
        const repository = this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory);
        const relative = node_adapters_1.nodePath.relative(repository, backup);
        if (relative.startsWith("..") || node_adapters_1.nodePath.isAbsolute(relative))
            throw new Error("The backup Git directory must be the backup directory or one of its parent directories.");
        const vaultToRepository = node_adapters_1.nodePath.relative(this.vaultPath, repository);
        const repositoryToVault = node_adapters_1.nodePath.relative(repository, this.vaultPath);
        const isInside = (relativePath) => relativePath === "" || (!relativePath.startsWith("..") && !node_adapters_1.nodePath.isAbsolute(relativePath));
        if (isInside(vaultToRepository) || isInside(repositoryToVault))
            throw new Error("The vault and backup Git directory must not overlap.");
        await this.fileSystem.ensureFolder(repository);
        await this.fileSystem.ensureFolder(backup);
        await this.encryption.validate();
    }
}
class DefaultConfigFactory {
    constructor(currentVaultPath, fileSystem, runner, ui, namingFactory, encryptionFactory, remoteFactory, archiveFactory) {
        this.currentVaultPath = currentVaultPath;
        this.fileSystem = fileSystem;
        this.runner = runner;
        this.ui = ui;
        this.namingFactory = namingFactory;
        this.encryptionFactory = encryptionFactory;
        this.remoteFactory = remoteFactory;
        this.archiveFactory = archiveFactory;
    }
    create(settings) {
        const vaultPath = node_adapters_1.nodePath.resolve(settings.vaultDirectory.trim() || this.currentVaultPath);
        const strategySettings = {
            ...settings,
            ageIdentityPath: settings.ageIdentityPath.trim() ? node_adapters_1.nodePath.resolve(vaultPath, settings.ageIdentityPath) : "",
        };
        return new ResolvedConfig(settings, vaultPath, this.fileSystem, this.namingFactory.create(strategySettings, this.ui), this.encryptionFactory.create(strategySettings, this.fileSystem, this.runner), this.remoteFactory.create(strategySettings, this.runner), this.archiveFactory.create(this.runner), this.runner);
    }
}
exports.DefaultConfigFactory = DefaultConfigFactory;
