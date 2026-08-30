import { App, Modal, Notice, Setting } from "obsidian";
import type { BackupSettings } from "../../domain/config";
import type { FileProxy, FileSystem } from "../../domain/file_system";
import type { UserInteraction } from "../../domain/user_interaction";

type Resolve<T> = (value: T) => void;

class TextPromptModal extends Modal {
  private value: string;
  private settled = false;
  private readonly title: string;

  constructor(app: App, title: string, suggested: string, private readonly resolveValue: Resolve<string | null>) {
    super(app);
    this.title = title;
    this.value = suggested;
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    new Setting(this.contentEl).setName("Archive name").addText((text) => text.setValue(this.value).onChange((value) => {
      this.value = value;
    }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Create backup").setCta().onClick(() => {
      this.settled = true;
      this.resolveValue(this.value);
      this.close();
    }));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
}

class RestoreModal extends Modal {
  private archivePath: string;
  private destination = "Restored backup";
  private settled = false;

  constructor(
    app: App,
    private readonly archives: FileProxy[],
    private readonly fileSystem: FileSystem,
    private readonly resolveValue: Resolve<{ archive: FileProxy; destination: string } | null>,
  ) {
    super(app);
    this.archivePath = archives[0].path;
  }

  onOpen(): void {
    this.titleEl.setText("Restore vault backup");
    new Setting(this.contentEl).setName("Backup archive").addDropdown((dropdown) => {
      this.archives.forEach((archive) => dropdown.addOption(archive.path, this.fileSystem.baseName(archive.path)));
      dropdown.setValue(this.archivePath).onChange((value) => {
        this.archivePath = value;
      });
    });
    new Setting(this.contentEl)
      .setName("Destination in current vault")
      .setDesc("A relative folder path. The archived vault folder will be created inside it.")
      .addText((text) => text.setValue(this.destination).onChange((value) => {
        this.destination = value;
      }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Restore").setWarning().onClick(() => {
      const archive = this.archives.find((item) => item.path === this.archivePath);
      if (!archive) return;
      this.settled = true;
      this.resolveValue({ archive, destination: this.destination });
      this.close();
    }));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
}

class ConfigurationModal extends Modal {
  private readonly draft: BackupSettings;
  private settled = false;

  constructor(app: App, current: BackupSettings, private readonly resolveValue: Resolve<BackupSettings | null>) {
    super(app);
    this.draft = { ...current, excludedVaultPaths: [...current.excludedVaultPaths] };
  }

  onOpen(): void {
    this.titleEl.setText("Configure vault backup");
    this.contentEl.createEl("p", { text: "Paths may be absolute. Leave vault directory empty to use the current vault." });
    this.text("Vault directory", "Current vault", this.draft.vaultDirectory, (value) => {
      this.draft.vaultDirectory = value;
    });
    this.text("Backup directory", "/path/to/backup-repo/archives", this.draft.backupDirectory, (value) => {
      this.draft.backupDirectory = value;
    });
    this.text("Backup Git directory", "Defaults to backup directory", this.draft.backupGitDirectory, (value) => {
      this.draft.backupGitDirectory = value;
    });
    this.toggle("Exclude vault .git folder", this.draft.excludeVaultGit, (value) => {
      this.draft.excludeVaultGit = value;
    });
    this.text("Other exclusions", ".obsidian/workspace.json, cache", this.draft.excludedVaultPaths.join(", "), (value) => {
      this.draft.excludedVaultPaths = value.split(",").map((item) => item.trim()).filter(Boolean);
    });
    new Setting(this.contentEl).setName("Archive naming").addDropdown((dropdown) => dropdown
      .addOption("same-delete", "Same name, delete commit first")
      .addOption("same-overwrite", "Same name, overwrite")
      .addOption("dated", "Date-formatted name")
      .addOption("custom", "Prompt for name")
      .setValue(this.draft.namingStrategy)
      .onChange((value) => {
        this.draft.namingStrategy = value as BackupSettings["namingStrategy"];
      }));
    this.text("Same archive name", "vault-backup", this.draft.sameArchiveName, (value) => {
      this.draft.sameArchiveName = value;
    });
    this.text("Date format", "YYYY-MM-DD_HH-mm-ss", this.draft.dateFormat, (value) => {
      this.draft.dateFormat = value;
    });
    new Setting(this.contentEl).setName("Encryption").addDropdown((dropdown) => dropdown
      .addOption("age", "age")
      .addOption("none", "None")
      .setValue(this.draft.encryptionStrategy)
      .onChange((value) => {
        this.draft.encryptionStrategy = value as BackupSettings["encryptionStrategy"];
      }));
    this.text("age recipient", "age1...", this.draft.ageRecipient, (value) => {
      this.draft.ageRecipient = value;
    });
    this.text("age identity path", "/path/to/identity.txt", this.draft.ageIdentityPath, (value) => {
      this.draft.ageIdentityPath = value;
    });
    new Setting(this.contentEl).setName("Remote").addDropdown((dropdown) => dropdown
      .addOption("none", "None")
      .addOption("git", "Git push/pull")
      .setValue(this.draft.remoteStrategy)
      .onChange((value) => {
        this.draft.remoteStrategy = value as BackupSettings["remoteStrategy"];
      }));
    this.text("Remote pull URL", "git@example.com:owner/backups.git", this.draft.remotePullUrl, (value) => {
      this.draft.remotePullUrl = value;
    });
    this.text("Remote push URL", "Defaults to pull URL", this.draft.remotePushUrl, (value) => {
      this.draft.remotePushUrl = value;
    });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Save configuration").setCta().onClick(() => {
      this.settled = true;
      this.resolveValue(this.draft);
      this.close();
    }));
  }

  private text(name: string, placeholder: string, value: string, update: (value: string) => void): void {
    new Setting(this.contentEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(value).onChange(update));
  }

  private toggle(name: string, value: boolean, update: (value: boolean) => void): void {
    new Setting(this.contentEl).setName(name).addToggle((toggle) => toggle.setValue(value).onChange(update));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
}

export class ObsidianUserInteraction implements UserInteraction {
  constructor(
    private readonly app: App,
    private readonly fileSystem: FileSystem,
  ) {}

  promptArchiveName(suggestedName: string): Promise<string | null> {
    return new Promise((resolve) => new TextPromptModal(this.app, "Name this backup", suggestedName, resolve).open());
  }

  chooseRestore(archives: FileProxy[]): Promise<{ archive: FileProxy; destination: string } | null> {
    return new Promise((resolve) => new RestoreModal(this.app, archives, this.fileSystem, resolve).open());
  }

  configure(current: BackupSettings): Promise<BackupSettings | null> {
    return new Promise((resolve) => new ConfigurationModal(this.app, current, resolve).open());
  }

  notice(message: string, timeout?: number): void {
    new Notice(message, timeout);
  }
}
