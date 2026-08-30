import type { BackupSettings } from "../domain/config";
import type { NamingContext, NamingStrategy } from "../domain/strategies";
import type { UserInteraction } from "../domain/user_interaction";

function safeName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/\.tar\.gz(?:\.age)?$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Archive name must contain at least one letter or number.");
  return cleaned;
}

function formatDate(date: Date, format: string): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    HH: String(date.getHours()).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ss: String(date.getSeconds()).padStart(2, "0"),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}

class FixedNamingStrategy implements NamingStrategy {
  constructor(private readonly name: string, public readonly replacementMode: "delete-first" | "overwrite") {}

  async nextArchiveName(): Promise<string> {
    return safeName(this.name);
  }
}

class DatedNamingStrategy implements NamingStrategy {
  readonly replacementMode = "unique" as const;

  constructor(private readonly format: string) {}

  async nextArchiveName(context: NamingContext): Promise<string> {
    return `${safeName(context.vaultName)}-${safeName(formatDate(context.now, this.format))}`;
  }
}

class CustomNamingStrategy implements NamingStrategy {
  readonly replacementMode = "unique" as const;

  constructor(private readonly ui: UserInteraction) {}

  async nextArchiveName(context: NamingContext): Promise<string> {
    const value = await this.ui.promptArchiveName(`${context.vaultName}-backup`);
    if (value === null) throw new Error("Backup cancelled.");
    return safeName(value);
  }
}

export class DefaultNamingStrategyFactory {
  create(settings: BackupSettings, ui: UserInteraction): NamingStrategy {
    switch (settings.namingStrategy) {
      case "same-delete":
        return new FixedNamingStrategy(settings.sameArchiveName, "delete-first");
      case "same-overwrite":
        return new FixedNamingStrategy(settings.sameArchiveName, "overwrite");
      case "custom":
        return new CustomNamingStrategy(ui);
      default:
        return new DatedNamingStrategy(settings.dateFormat);
    }
  }
}
