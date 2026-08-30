import type { Command, CommandContext } from "../domain/commands";

export class ConfigureBackupCommand implements Command {
  async invoke(context: CommandContext): Promise<void> {
    const ui = context.config.getPlatformBridge().getUserInteraction();
    const configured = await ui.configure(context.config.getSettings());
    if (!configured) return;
    await context.saveSettings(configured);
    ui.notice("Backup configuration saved.");
  }
}
