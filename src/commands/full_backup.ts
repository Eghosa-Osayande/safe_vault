import type { Command, CommandContext } from "../domain/commands";
import { BackupCommand } from "./backup";
import { PushCommand } from "./push";

export class FullBackupCommand implements Command {
  constructor(
    private readonly backup = new BackupCommand(),
    private readonly push = new PushCommand(),
  ) {}

  async invoke(context: CommandContext): Promise<void> {
    await this.backup.invoke(context);
    await this.push.invoke(context);
  }
}
