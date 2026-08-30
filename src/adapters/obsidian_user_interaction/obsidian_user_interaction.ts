import { remote } from "electron";
import { App, Modal, Notice, Setting } from "obsidian";
import { normalizeBackupSettings, normalizeExcludedVaultPaths } from "../../domain/config";
import type { BackupSettings } from "../../domain/config";
import type { FileProxy, FileSystem } from "../../domain/file_system";
import type { ProcessRunner } from "../../domain/process_runner";
import type { FilePickerRequest, PasswordPromptRequest, UserInteraction } from "../../domain/user_interaction";
import { generateAgeIdentityFiles } from "../../strategies";

type Resolve<T> = (value: T) => void;
type PickPath = (request: FilePickerRequest) => Promise<string | null>;

export function validatePasswordPromptValues(password: string, confirmation: string, confirm: boolean): void {
  if (!password) throw new Error("Password cannot be empty.");
  if (confirm && password !== confirmation) throw new Error("Passwords do not match.");
}

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

class PasswordPromptModal extends Modal {
  private password = "";
  private confirmation = "";
  private settled = false;

  constructor(
    app: App,
    private readonly request: PasswordPromptRequest,
    private readonly resolveValue: Resolve<string | null>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.request.title);
    new Setting(this.contentEl).setName("Password").addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => { this.password = value; });
    });
    if (this.request.confirm) {
      new Setting(this.contentEl).setName("Confirm password").addText((text) => {
        text.inputEl.type = "password";
        text.onChange((value) => { this.confirmation = value; });
      });
    }
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Continue").setCta().onClick(() => this.submit()));
  }

  private submit(): void {
    try {
      validatePasswordPromptValues(this.password, this.confirmation, this.request.confirm);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message, 5000);
      return;
    }
    this.settled = true;
    this.resolveValue(this.password);
    this.close();
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

  constructor(
    app: App,
    current: BackupSettings,
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
    private readonly pickPath: PickPath,
    private readonly resolveValue: Resolve<BackupSettings | null>,
  ) {
    super(app);
    this.draft = normalizeBackupSettings(current);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    this.titleEl.setText("Configure plugin");
    // this.contentEl.createEl("p", {
    //   text: "Configure where backups are stored and how they are archived, protected, and synchronized.",
    //   cls: "vault-archive-config-intro",
    // });
    this.actions();

    this.heading("Directories");

    // this.path("Vault directory", "Current vault", this.draft.vaultDirectory, "directory", (value) => {
    //   this.draft.vaultDirectory = value;
    // });

    this.path("Backup directory", "/path/to/backups", this.draft.backupDirectory, "directory", (value) => {
      this.draft.backupDirectory = value;
    });

    new Setting(this.contentEl)
      .setName("Excluded paths")
      .setDesc("One exact vault-relative path per line. End folders with /. Wildcards are not supported.")
      .addTextArea((text) => text
        .setPlaceholder(".git/\n.obsidian/workspace.json")
        .setValue(this.draft.excludedVaultPaths.join("\n"))
        .onChange((value) => {
          this.draft.excludedVaultPaths = value.split(/\r?\n/);
        }));

    this.heading("Archive");
    const namingKind = this.draft.namingStrategy.startsWith("same-") ? "same" : this.draft.namingStrategy;
    new Setting(this.contentEl).setName("Naming strategy").addDropdown((dropdown) => dropdown
      .addOption("same", "Same name")
      .addOption("dated", "Date formatted")
      .addOption("custom", "Prompt for name")
      .setValue(namingKind)
      .onChange((value) => {
        this.draft.namingStrategy = value === "same" ? "same-overwrite" : value as BackupSettings["namingStrategy"];
        this.render();
      }));
    if (this.draft.namingStrategy.startsWith("same-")) {
      this.text("Archive name", "vault-backup", this.draft.sameArchiveName, (value) => {
        this.draft.sameArchiveName = value;
      });
      new Setting(this.contentEl).setName("Existing archive").addDropdown((dropdown) => dropdown
        .addOption("overwrite", "Overwrite")
        .addOption("delete-first", "Delete before replacing")
        .setValue(this.draft.namingStrategy === "same-delete" ? "delete-first" : "overwrite")
        .onChange((value) => {
          this.draft.namingStrategy = value === "delete-first" ? "same-delete" : "same-overwrite";
        }));
    } else if (this.draft.namingStrategy === "dated") {
      this.text("Date format", "YYYY-MM-DD_HH-mm-ss", this.draft.dateFormat, (value) => {
        this.draft.dateFormat = value;
      });
    }

    this.heading("Encryption");
    this.toggle("Encrypt backups", this.draft.encryptionStrategy !== "none", (enabled) => {
      this.draft.encryptionStrategy = enabled ? "age" : "none";
      this.render();
    });
    if (this.draft.encryptionStrategy !== "none") {
      new Setting(this.contentEl).setName("Encryption strategy").addDropdown((dropdown) => dropdown
        .addOption("age", "age")
        .addOption("password", "Password")
        .setValue(this.draft.encryptionStrategy)
        .onChange((value) => {
          this.draft.encryptionStrategy = value as BackupSettings["encryptionStrategy"];
          this.render();
        }));
      if (this.draft.encryptionStrategy === "age") {
        new Setting(this.contentEl)
          .setName("Generate age identity")
          .setDesc("Create a new identity and sibling .pub recipient file, then fill the fields below.")
          .addButton((button) => button.setButtonText("Generate").onClick(() => {
            void this.generateAgeIdentity();
          }));
        this.path("Recipient file", "/path/to/identity.txt.pub", this.draft.ageRecipientPath, "file", (value) => {
          this.draft.ageRecipientPath = value;
        });
        this.text("Recipient value", "age1...", this.draft.ageRecipient, (value) => {
          this.draft.ageRecipient = value;
        });
        this.path("Secret identity file", "/path/to/identity.txt", this.draft.ageIdentityPath, "file", (value) => {
          this.draft.ageIdentityPath = value;
        });
      } else {
        new Setting(this.contentEl)
          .setName("Password encryption")
          .setDesc("The password is requested for every backup and restore and is never saved.");
      }
    }

    this.heading("Version Control");
    this.toggle("Enable version control", this.draft.versionControlStrategy !== "none", (enabled) => {
      this.draft.versionControlStrategy = enabled ? "git" : "none";
      if (!enabled) this.draft.remoteStrategy = "none";
      this.render();
    });
    if (this.draft.versionControlStrategy !== "none") {
      new Setting(this.contentEl).setName("Version control strategy").addDropdown((dropdown) => dropdown
        .addOption("git", "Git")
        .setValue(this.draft.versionControlStrategy));
    }

    this.heading("Remote");
    new Setting(this.contentEl).setName("Remote strategy").addDropdown((dropdown) => dropdown
      .addOption("none", "None")
      .addOption("git", "Git")
      .setValue(this.draft.remoteStrategy)
      .onChange((value) => {
        this.draft.remoteStrategy = value as BackupSettings["remoteStrategy"];
        if (value === "git") this.draft.versionControlStrategy = "git";
        this.render();
      }));
    if (this.draft.remoteStrategy === "git") {
      this.text("Pull URL", "git@example.com:owner/backups.git", this.draft.remotePullUrl, (value) => {
        this.draft.remotePullUrl = value;
      });
      this.text("Push URL", "Defaults to pull URL", this.draft.remotePushUrl, (value) => {
        this.draft.remotePushUrl = value;
      });
    }

    this.actions();
  }

  private heading(title: string): void {
    this.contentEl.createEl("h3", { text: title, cls: "vault-archive-config-heading" });
  }

  private actions(): void {
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Save configuration").setCta().onClick(() => this.save()));
  }

  private text(name: string, placeholder: string, value: string, update: (value: string) => void): void {
    new Setting(this.contentEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(value).onChange(update));
  }

  private path(
    name: string,
    placeholder: string,
    value: string,
    kind: "file" | "directory",
    update: (value: string) => void,
  ): void {
    let input: HTMLInputElement | null = null;
    new Setting(this.contentEl)
      .setName(name)
      .addText((text) => {
        input = text.inputEl;
        text.setPlaceholder(placeholder).setValue(value).onChange(update);
      })
      .addButton((button) => button.setButtonText("Browse").onClick(() => {
        void this.pickPath({
          kind,
          mode: "open",
          title: `Select ${name.toLowerCase()}`,
          defaultPath: value || undefined,
          showHiddenFiles: true,
          canCreateDirectories: kind === "directory",
        })
          .then((selected) => {
            if (!selected) return;
            update(selected);
            if (input) input.value = selected;
          });
      }));
  }

  private toggle(name: string, value: boolean, update: (value: boolean) => void): void {
    new Setting(this.contentEl).setName(name).addToggle((toggle) => toggle.setValue(value).onChange(update));
  }

  private async generateAgeIdentity(): Promise<void> {
    if (!(await this.runner.available("age-keygen"))) {
      new Notice("age-keygen is not installed or is not available on PATH.", 8000);
      return;
    }
    const identityPath = await this.pickPath({
      kind: "file",
      mode: "save",
      title: "Save age identity",
      defaultPath: this.draft.ageIdentityPath || "age-identity.txt",
      showHiddenFiles: true,
      canCreateDirectories: true,
    });
    if (!identityPath) return;
    try {
      const generated = await generateAgeIdentityFiles(identityPath, this.fileSystem, this.runner);
      this.draft.ageIdentityPath = generated.identityPath;
      this.draft.ageRecipientPath = generated.recipientPath;
      this.draft.ageRecipient = generated.recipient;
      this.render();
      new Notice("Age identity and recipient files created.", 5000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not generate age identity: ${message}`, 10000);
    }
  }

  private save(): void {
    try {
      this.draft.excludedVaultPaths = normalizeExcludedVaultPaths(this.draft.excludedVaultPaths);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message, 8000);
      return;
    }
    if (this.draft.remoteStrategy === "git") this.draft.versionControlStrategy = "git";
    this.settled = true;
    this.resolveValue(normalizeBackupSettings(this.draft));
    this.close();
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
    private readonly runner: ProcessRunner,
  ) { }

  promptArchiveName(suggestedName: string): Promise<string | null> {
    return new Promise((resolve) => new TextPromptModal(this.app, "Name this backup", suggestedName, resolve).open());
  }

  chooseRestore(archives: FileProxy[]): Promise<{ archive: FileProxy; destination: string } | null> {
    return new Promise((resolve) => new RestoreModal(this.app, archives, this.fileSystem, resolve).open());
  }

  configure(current: BackupSettings): Promise<BackupSettings | null> {
    return new Promise((resolve) => new ConfigurationModal(
      this.app,
      current,
      this.fileSystem,
      this.runner,
      (request) => this.pickPath(request),
      resolve,
    ).open());
  }

  promptPassword(request: PasswordPromptRequest): Promise<string | null> {
    return new Promise((resolve) => new PasswordPromptModal(this.app, request, resolve).open());
  }

  async pickPath(request: FilePickerRequest): Promise<string | null> {
    const extraProperties = [
      ...(request.showHiddenFiles ? ["showHiddenFiles"] : []),
      ...(request.canCreateDirectories ? ["createDirectory"] : []),
    ];
    if (request.mode === "save") {
      const result = await remote.dialog.showSaveDialog({
        title: request.title,
        defaultPath: request.defaultPath,
        properties: extraProperties,
      });
      return result.canceled ? null : result.filePath ?? null;
    }
    const result = await remote.dialog.showOpenDialog({
      title: request.title,
      defaultPath: request.defaultPath,
      properties: [request.kind === "directory" ? "openDirectory" : "openFile", ...extraProperties],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  notice(message: string, timeout?: number): void {
    new Notice(message, timeout);
  }
}
