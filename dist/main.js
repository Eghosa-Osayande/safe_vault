"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const commands_1 = require("./commands");
const config_1 = require("./config");
const domain_1 = require("./domain");
const node_adapters_1 = require("./node-adapters");
const obsidian_adapter_1 = require("./obsidian-adapter");
const strategies_1 = require("./strategies");
class VaultArchivePlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = domain_1.DEFAULT_SETTINGS;
        this.running = false;
    }
    async onload() {
        var _a;
        this.settings = { ...domain_1.DEFAULT_SETTINGS, ...((_a = await this.loadData()) !== null && _a !== void 0 ? _a : {}) };
        this.register("backup", "Backup vault", new commands_1.BackupCommand());
        this.register("push", "Push backup repository", new commands_1.PushCommand());
        this.register("pull", "Pull backup repository", new commands_1.PullCommand());
        this.register("full-backup", "Full backup (backup and push)", new commands_1.FullBackupCommand());
        this.register("restore", "Restore vault backup", new commands_1.RestoreCommand());
        this.register("configure-backup", "Configure backup", new commands_1.ConfigureBackupCommand());
    }
    register(id, name, command) {
        this.addCommand({ id, name, callback: () => this.handleCommand(command) });
    }
    async handleCommand(command) {
        if (this.running) {
            new obsidian_1.Notice("A backup command is already running.");
            return;
        }
        this.running = true;
        const ui = new obsidian_adapter_1.ObsidianUserInteraction(this.app);
        const fileSystem = new node_adapters_1.NodeFileSystem();
        const runner = new node_adapters_1.NodeProcessRunner();
        const vaultPath = this.app.vault.adapter.basePath;
        if (!vaultPath) {
            this.running = false;
            new obsidian_1.Notice("This plugin requires a local desktop vault.", 5000);
            return;
        }
        const configFactory = new config_1.DefaultConfigFactory(vaultPath, fileSystem, runner, ui, new strategies_1.DefaultNamingStrategyFactory(), new strategies_1.DefaultEncryptionStrategyFactory(), new strategies_1.DefaultRemoteStrategyFactory(), new strategies_1.TarArchiveStrategyFactory());
        const context = {
            config: configFactory.create(this.settings),
            fileSystem,
            repository: new node_adapters_1.GitBackupRepository(runner),
            ui,
            saveSettings: async (settings) => { this.settings = settings; await this.saveData(settings); },
        };
        try {
            await command.invoke(context);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new obsidian_1.Notice(`Vault backup failed: ${message}`, 10000);
            console.error("Vault Archive plugin command failed", error);
        }
        finally {
            this.running = false;
        }
    }
}
exports.default = VaultArchivePlugin;
