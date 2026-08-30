import type { Command, CommandContext } from "../domain/commands";

export class PullCommand implements Command {
  async invoke({ config }: CommandContext): Promise<void> {
    const versionControlStrategy = config.getVersionControlStrategy();
    await config.validate();
    const versionControlDirectory = config.getBackupDirectory();
    await versionControlStrategy.ensureInitialized(versionControlDirectory);
    await config.getRemoteStrategy().pull(versionControlDirectory);
    config.getPlatformBridge().getUserInteraction().notice("Backup repository pulled.");
  }
}
