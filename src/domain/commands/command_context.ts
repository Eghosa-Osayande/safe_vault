import type { BackupSettings, Config } from "../config";

export interface CommandContext {
  config: Config;
  saveSettings(settings: BackupSettings): Promise<void>;
}
