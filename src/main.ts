import { Notice, Plugin } from "obsidian";
import { BackupCommand, ConfigureBackupCommand, FullBackupCommand, PullCommand, PushCommand, RestoreCommand } from "./commands";
import { DefaultConfigFactory } from "./config";
import { BackupSettings, Command, CommandContext, DEFAULT_SETTINGS } from "./domain";
import { GitBackupRepository, NodeFileSystem, NodeProcessRunner } from "./node-adapters";
import { ObsidianUserInteraction } from "./obsidian-adapter";
import { DefaultEncryptionStrategyFactory, DefaultNamingStrategyFactory, DefaultRemoteStrategyFactory, TarArchiveStrategyFactory } from "./strategies";

export default class VaultArchivePlugin extends Plugin {
  private settings: BackupSettings = DEFAULT_SETTINGS;
  private running = false;

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() as Partial<BackupSettings> | null ?? {}) };
    this.register("backup", "Backup vault", new BackupCommand());
    this.register("push", "Push backup repository", new PushCommand());
    this.register("pull", "Pull backup repository", new PullCommand());
    this.register("full-backup", "Full backup (backup and push)", new FullBackupCommand());
    this.register("restore", "Restore vault backup", new RestoreCommand());
    this.register("configure-backup", "Configure backup", new ConfigureBackupCommand());
  }

  private register(id: string, name: string, command: Command): void {
    this.addCommand({ id, name, callback: () => this.handleCommand(command) });
  }

  private async handleCommand(command: Command): Promise<void> {
    if (this.running) { new Notice("A backup command is already running."); return; }
    this.running = true;
    const ui = new ObsidianUserInteraction(this.app);
    const fileSystem = new NodeFileSystem();
    const runner = new NodeProcessRunner();
    const vaultPath = this.app.vault.adapter.basePath;
    if (!vaultPath) { this.running = false; new Notice("This plugin requires a local desktop vault.", 5000); return; }
    const configFactory = new DefaultConfigFactory(
      vaultPath, fileSystem, runner, ui,
      new DefaultNamingStrategyFactory(), new DefaultEncryptionStrategyFactory(),
      new DefaultRemoteStrategyFactory(), new TarArchiveStrategyFactory(),
    );
    const context: CommandContext = {
      config: configFactory.create(this.settings),
      fileSystem,
      repository: new GitBackupRepository(runner),
      ui,
      saveSettings: async (settings) => { this.settings = settings; await this.saveData(settings); },
    };
    try {
      await command.invoke(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Vault backup failed: ${message}`, 10000);
      console.error("Vault Archive plugin command failed", error);
    } finally {
      this.running = false;
    }
  }
}
