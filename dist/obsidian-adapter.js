"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianUserInteraction = void 0;
const obsidian_1 = require("obsidian");
const node_adapters_1 = require("./node-adapters");
class TextPromptModal extends obsidian_1.Modal {
    constructor(app, title, suggested, resolveValue) {
        super(app);
        this.resolveValue = resolveValue;
        this.settled = false;
        this.title = title;
        this.value = suggested;
    }
    onOpen() {
        this.titleEl.setText(this.title);
        new obsidian_1.Setting(this.contentEl).setName("Archive name").addText((text) => text.setValue(this.value).onChange((value) => { this.value = value; }));
        new obsidian_1.Setting(this.contentEl).addButton((button) => button.setButtonText("Create backup").setCta().onClick(() => { this.settled = true; this.resolveValue(this.value); this.close(); }));
    }
    onClose() { this.contentEl.empty(); if (!this.settled)
        this.resolveValue(null); }
}
class RestoreModal extends obsidian_1.Modal {
    constructor(app, archives, resolveValue) {
        super(app);
        this.archives = archives;
        this.resolveValue = resolveValue;
        this.destination = "Restored backup";
        this.settled = false;
        this.archivePath = archives[0].path;
    }
    onOpen() {
        this.titleEl.setText("Restore vault backup");
        new obsidian_1.Setting(this.contentEl).setName("Backup archive").addDropdown((dropdown) => {
            this.archives.forEach((archive) => dropdown.addOption(archive.path, node_adapters_1.nodePath.basename(archive.path)));
            dropdown.setValue(this.archivePath).onChange((value) => { this.archivePath = value; });
        });
        new obsidian_1.Setting(this.contentEl).setName("Destination in current vault").setDesc("A relative folder path. The archived vault folder will be created inside it.").addText((text) => text.setValue(this.destination).onChange((value) => { this.destination = value; }));
        new obsidian_1.Setting(this.contentEl).addButton((button) => button.setButtonText("Restore").setWarning().onClick(() => {
            const archive = this.archives.find((item) => item.path === this.archivePath);
            if (!archive)
                return;
            this.settled = true;
            this.resolveValue({ archive, destination: this.destination });
            this.close();
        }));
    }
    onClose() { this.contentEl.empty(); if (!this.settled)
        this.resolveValue(null); }
}
class ConfigurationModal extends obsidian_1.Modal {
    constructor(app, current, resolveValue) {
        super(app);
        this.resolveValue = resolveValue;
        this.settled = false;
        this.draft = { ...current, excludedVaultPaths: [...current.excludedVaultPaths] };
    }
    onOpen() {
        this.titleEl.setText("Configure vault backup");
        this.contentEl.createEl("p", { text: "Paths may be absolute. Leave vault directory empty to use the current vault." });
        this.text("Vault directory", "Current vault", this.draft.vaultDirectory, (v) => this.draft.vaultDirectory = v);
        this.text("Backup directory", "/path/to/backup-repo/archives", this.draft.backupDirectory, (v) => this.draft.backupDirectory = v);
        this.text("Backup Git directory", "Defaults to backup directory", this.draft.backupGitDirectory, (v) => this.draft.backupGitDirectory = v);
        this.toggle("Exclude vault .git folder", this.draft.excludeVaultGit, (v) => this.draft.excludeVaultGit = v);
        this.text("Other exclusions", ".obsidian/workspace.json, cache", this.draft.excludedVaultPaths.join(", "), (v) => this.draft.excludedVaultPaths = v.split(",").map((x) => x.trim()).filter(Boolean));
        new obsidian_1.Setting(this.contentEl).setName("Archive naming").addDropdown((d) => d
            .addOption("same-delete", "Same name, delete commit first")
            .addOption("same-overwrite", "Same name, overwrite")
            .addOption("dated", "Date-formatted name")
            .addOption("custom", "Prompt for name")
            .setValue(this.draft.namingStrategy).onChange((v) => this.draft.namingStrategy = v));
        this.text("Same archive name", "vault-backup", this.draft.sameArchiveName, (v) => this.draft.sameArchiveName = v);
        this.text("Date format", "YYYY-MM-DD_HH-mm-ss", this.draft.dateFormat, (v) => this.draft.dateFormat = v);
        new obsidian_1.Setting(this.contentEl).setName("Encryption").addDropdown((d) => d.addOption("age", "age").addOption("none", "None").setValue(this.draft.encryptionStrategy).onChange((v) => this.draft.encryptionStrategy = v));
        this.text("age recipient", "age1...", this.draft.ageRecipient, (v) => this.draft.ageRecipient = v);
        this.text("age identity path", "/path/to/identity.txt", this.draft.ageIdentityPath, (v) => this.draft.ageIdentityPath = v);
        new obsidian_1.Setting(this.contentEl).setName("Remote").addDropdown((d) => d.addOption("none", "None").addOption("git", "Git push/pull").setValue(this.draft.remoteStrategy).onChange((v) => this.draft.remoteStrategy = v));
        this.text("Remote pull URL", "git@example.com:owner/backups.git", this.draft.remotePullUrl, (v) => this.draft.remotePullUrl = v);
        this.text("Remote push URL", "Defaults to pull URL", this.draft.remotePushUrl, (v) => this.draft.remotePushUrl = v);
        new obsidian_1.Setting(this.contentEl).addButton((button) => button.setButtonText("Save configuration").setCta().onClick(() => { this.settled = true; this.resolveValue(this.draft); this.close(); }));
    }
    text(name, placeholder, value, update) {
        new obsidian_1.Setting(this.contentEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(value).onChange(update));
    }
    toggle(name, value, update) {
        new obsidian_1.Setting(this.contentEl).setName(name).addToggle((toggle) => toggle.setValue(value).onChange(update));
    }
    onClose() { this.contentEl.empty(); if (!this.settled)
        this.resolveValue(null); }
}
class ObsidianUserInteraction {
    constructor(app) {
        this.app = app;
    }
    promptArchiveName(suggestedName) {
        return new Promise((resolve) => new TextPromptModal(this.app, "Name this backup", suggestedName, resolve).open());
    }
    chooseRestore(archives) {
        return new Promise((resolve) => new RestoreModal(this.app, archives, resolve).open());
    }
    configure(current) {
        return new Promise((resolve) => new ConfigurationModal(this.app, current, resolve).open());
    }
    notice(message, timeout) { new obsidian_1.Notice(message, timeout); }
}
exports.ObsidianUserInteraction = ObsidianUserInteraction;
