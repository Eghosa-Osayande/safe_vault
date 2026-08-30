import { Notice, Plugin } from "obsidian";
import { BackupCommand, ConfigureBackupCommand, FullBackupCommand, PullCommand, PushCommand, RestoreCommand } from "./commands";
import { DefaultConfigFactory } from "./configs";
import { Command, CommandContext } from "./domain/commands";
import { BackupSettings, DEFAULT_SETTINGS, normalizeBackupSettings } from "./domain/config";
import { ObsidianDesktopPlatformBridge } from "./adapters/obsidian_platform_bridge";

export default class VaultArchivePlugin extends Plugin {
  private settings: BackupSettings = DEFAULT_SETTINGS;
  private running = false;

  async onload(): Promise<void> {
    this.settings = normalizeBackupSettings(await this.loadData());
    this.registerVaultCommand("backup", "Backup vault", new BackupCommand());
    this.registerVaultCommand("push", "Push backup repository", new PushCommand());
    this.registerVaultCommand("pull", "Pull backup repository", new PullCommand());
    this.registerVaultCommand("full-backup", "Full backup (backup and push)", new FullBackupCommand());
    this.registerVaultCommand("restore", "Restore vault backup", new RestoreCommand());
    this.registerVaultCommand("configure-backup", "Configure backup", new ConfigureBackupCommand());
  }

  private registerVaultCommand(id: string, name: string, command: Command): void {
    this.addCommand({ id, name, callback: () => this.handleCommand(command) });
  }

  private async handleCommand(command: Command): Promise<void> {
    if (this.running) { new Notice("A backup command is already running."); return; }
    this.running = true;
    const vaultPath = this.app.vault.adapter.basePath;
    if (!vaultPath) { this.running = false; new Notice("This plugin requires a local desktop vault.", 5000); return; }
    const platformBridge = new ObsidianDesktopPlatformBridge(this.app);
    const configFactory = new DefaultConfigFactory(
      vaultPath,
      platformBridge,
    );
    const context: CommandContext = {
      config: configFactory.create(this.settings),
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
