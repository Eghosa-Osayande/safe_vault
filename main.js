var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultArchivePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/node-adapters.ts
var childProcess = require("node:child_process");
var fs = require("node:fs");
var path = require("node:path");
var NodeFile = class {
  constructor(path2) {
    this.path = path2;
  }
  async read() {
    return fs.promises.readFile(this.path);
  }
};
var NodeFolder = class _NodeFolder {
  constructor(path2) {
    this.path = path2;
  }
  async getContents() {
    const entries = await fs.promises.readdir(this.path, { withFileTypes: true });
    return entries.map((entry) => {
      const entryPath = path.join(this.path, entry.name);
      return entry.isDirectory() ? new _NodeFolder(entryPath) : new NodeFile(entryPath);
    });
  }
};
var NodeFileSystem = class {
  file(filePath) {
    return new NodeFile(filePath);
  }
  folder(folderPath) {
    return new NodeFolder(folderPath);
  }
  async exists(entityPath) {
    try {
      await fs.promises.access(entityPath);
      return true;
    } catch (e) {
      return false;
    }
  }
  async ensureFolder(folderPath) {
    await fs.promises.mkdir(folderPath, { recursive: true });
  }
  async listFiles(folderPath) {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => new NodeFile(path.join(folderPath, entry.name)));
  }
  async copy(source, destination) {
    await fs.promises.copyFile(source, destination);
  }
  async move(source, destination) {
    try {
      await fs.promises.rename(source, destination);
    } catch (error) {
      if (error.code !== "EXDEV") throw error;
      await fs.promises.copyFile(source, destination);
      await fs.promises.unlink(source);
    }
  }
  async remove(entityPath) {
    await fs.promises.rm(entityPath, { force: true });
  }
};
var NodeProcessRunner = class {
  async run(command, args, cwd) {
    return new Promise((resolve, reject) => {
      const currentPath = process.env.PATH || "";
      const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", currentPath].filter(Boolean).join(":") };
      childProcess.execFile(command, args, { cwd, env, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }
        const code = typeof error.code === "number" ? error.code : 1;
        reject(new Error(`${command} failed (${code}): ${(stderr || error.message).trim()}`));
      });
    });
  }
  async available(command) {
    try {
      await this.run(command, ["--version"]);
      return true;
    } catch (e) {
      return false;
    }
  }
};
var GitBackupRepository = class {
  constructor(runner) {
    this.runner = runner;
  }
  async ensureRepository(repository) {
    try {
      const topLevel = (await this.runner.run("git", ["rev-parse", "--show-toplevel"], repository.path)).stdout.trim();
      if (path.resolve(topLevel) !== path.resolve(repository.path)) await this.runner.run("git", ["init"], repository.path);
    } catch (e) {
      await this.runner.run("git", ["init"], repository.path);
    }
  }
  async commitAll(repository, message) {
    await this.runner.run("git", ["add", "-A"], repository.path);
    try {
      await this.runner.run("git", ["diff", "--cached", "--quiet"], repository.path);
      return false;
    } catch (e) {
      await this.runner.run("git", ["commit", "-m", message], repository.path);
      return true;
    }
  }
};
var nodePath = path;

// src/commands.ts
var os = require("node:os");
function tempPath(directory, suffix) {
  return nodePath.join(directory, `.obsidian-vault-backup-${Date.now()}-${Math.random().toString(16).slice(2)}${suffix}`);
}
var BackupCommand = class {
  async invoke(context) {
    const { config, fileSystem, repository, ui } = context;
    await config.validate();
    const backup = config.getBackupDirectory();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    const vault = config.getVaultDirectory();
    const naming = config.getNamingStrategy();
    const encryption = config.getEncryptionStrategy();
    const baseName = await naming.nextArchiveName({ vaultName: nodePath.basename(vault.path), now: /* @__PURE__ */ new Date() });
    const finalPath = nodePath.join(backup.path, `${baseName}.tar.gz${encryption.extension}`);
    if (naming.replacementMode === "delete-first" && await fileSystem.exists(finalPath)) {
      await fileSystem.remove(finalPath);
      await repository.commitAll(gitDirectory, `Delete previous backup ${nodePath.basename(finalPath)}`);
    }
    const temporaryArchive = tempPath(os.tmpdir(), ".tar.gz");
    const temporaryOutput = encryption.extension ? `${temporaryArchive}${encryption.extension}` : temporaryArchive;
    try {
      const archive = await config.getArchiveStrategy().createArchive(vault, temporaryArchive, config.getExcludedPaths());
      const encrypted = await encryption.encryptFile(archive, temporaryOutput);
      if (await fileSystem.exists(finalPath)) await fileSystem.remove(finalPath);
      await fileSystem.move(encrypted.path, finalPath);
    } finally {
      await fileSystem.remove(temporaryArchive);
      await fileSystem.remove(temporaryOutput);
    }
    const committed = await repository.commitAll(gitDirectory, `Create backup ${nodePath.basename(finalPath)}`);
    ui.notice(committed ? `Backup created: ${nodePath.basename(finalPath)}` : "Backup archive was unchanged.", 5e3);
  }
};
var PushCommand = class {
  async invoke({ config, repository, ui }) {
    await config.validate();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    await config.getRemoteStrategy().push(gitDirectory);
    ui.notice("Backup repository pushed.");
  }
};
var PullCommand = class {
  async invoke({ config, repository, ui }) {
    await config.validate();
    const gitDirectory = config.getBackupGitDirectory();
    await repository.ensureRepository(gitDirectory);
    await config.getRemoteStrategy().pull(gitDirectory);
    ui.notice("Backup repository pulled.");
  }
};
var FullBackupCommand = class {
  constructor(backup = new BackupCommand(), push = new PushCommand()) {
    this.backup = backup;
    this.push = push;
  }
  async invoke(context) {
    await this.backup.invoke(context);
    await this.push.invoke(context);
  }
};
var RestoreCommand = class {
  async invoke(context) {
    const { config, fileSystem, ui } = context;
    await config.validate();
    const archives = (await fileSystem.listFiles(config.getBackupDirectory().path)).filter((file) => !nodePath.basename(file.path).startsWith(".")).sort((left, right) => nodePath.basename(right.path).localeCompare(nodePath.basename(left.path)));
    if (!archives.length) throw new Error("No backup archives were found.");
    const selection = await ui.chooseRestore(archives);
    if (!selection) return;
    const destinationPath = nodePath.resolve(config.getVaultDirectory().path, selection.destination);
    const relative = nodePath.relative(config.getVaultDirectory().path, destinationPath);
    if (!selection.destination.trim() || relative.startsWith("..") || nodePath.isAbsolute(relative)) throw new Error("Restore destination must be a folder inside the current vault.");
    await fileSystem.ensureFolder(destinationPath);
    const temporaryArchive = tempPath(os.tmpdir(), ".restore.tar.gz");
    let archive = null;
    try {
      archive = await config.getEncryptionStrategy().decryptFile(selection.archive, temporaryArchive);
      await config.getArchiveStrategy().restoreArchive(archive, fileSystem.folder(destinationPath));
    } finally {
      if (archive) await fileSystem.remove(archive.path);
      await fileSystem.remove(temporaryArchive);
    }
    ui.notice(`Backup restored into ${selection.destination}.`, 5e3);
  }
};
var ConfigureBackupCommand = class {
  async invoke(context) {
    const configured = await context.ui.configure(context.config.getSettings());
    if (!configured) return;
    await context.saveSettings(configured);
    context.ui.notice("Backup configuration saved.");
  }
};

// src/config.ts
var ResolvedConfig = class {
  constructor(settings, vaultPath, fileSystem, naming, encryption, remote, archive, runner) {
    this.settings = settings;
    this.vaultPath = vaultPath;
    this.fileSystem = fileSystem;
    this.naming = naming;
    this.encryption = encryption;
    this.remote = remote;
    this.archive = archive;
    this.runner = runner;
  }
  resolveSettingPath(value) {
    return nodePath.resolve(this.vaultPath, value);
  }
  getVaultDirectory() {
    return this.fileSystem.folder(this.vaultPath);
  }
  getBackupDirectory() {
    return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupDirectory));
  }
  getBackupGitDirectory() {
    return this.fileSystem.folder(this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory));
  }
  getEncryptionStrategy() {
    return this.encryption;
  }
  getRemoteStrategy() {
    return this.remote;
  }
  getNamingStrategy() {
    return this.naming;
  }
  getArchiveStrategy() {
    return this.archive;
  }
  getSettings() {
    return { ...this.settings, excludedVaultPaths: [...this.settings.excludedVaultPaths] };
  }
  getExcludedPaths() {
    const excluded = this.settings.excludedVaultPaths.map((item) => item.trim()).filter(Boolean);
    if (this.settings.excludeVaultGit && !excluded.includes(".git")) excluded.push(".git");
    return excluded;
  }
  async validate(requireBackup = true) {
    if (!await this.runner.available("git")) throw new Error("git is not installed or is not available on PATH.");
    if (!await this.runner.available("tar")) throw new Error("tar is not installed or is not available on PATH.");
    if (!await this.fileSystem.exists(this.vaultPath)) throw new Error(`Vault directory does not exist: ${this.vaultPath}`);
    if (!this.settings.backupDirectory.trim()) {
      if (requireBackup) throw new Error("No backup directory is configured. Run Configure backup first.");
      return;
    }
    const backup = this.resolveSettingPath(this.settings.backupDirectory);
    const repository = this.resolveSettingPath(this.settings.backupGitDirectory || this.settings.backupDirectory);
    const relative = nodePath.relative(repository, backup);
    if (relative.startsWith("..") || nodePath.isAbsolute(relative)) throw new Error("The backup Git directory must be the backup directory or one of its parent directories.");
    const vaultToRepository = nodePath.relative(this.vaultPath, repository);
    const repositoryToVault = nodePath.relative(repository, this.vaultPath);
    const isInside = (relativePath) => relativePath === "" || !relativePath.startsWith("..") && !nodePath.isAbsolute(relativePath);
    if (isInside(vaultToRepository) || isInside(repositoryToVault)) throw new Error("The vault and backup Git directory must not overlap.");
    await this.fileSystem.ensureFolder(repository);
    await this.fileSystem.ensureFolder(backup);
    await this.encryption.validate();
  }
};
var DefaultConfigFactory = class {
  constructor(currentVaultPath, fileSystem, runner, ui, namingFactory, encryptionFactory, remoteFactory, archiveFactory) {
    this.currentVaultPath = currentVaultPath;
    this.fileSystem = fileSystem;
    this.runner = runner;
    this.ui = ui;
    this.namingFactory = namingFactory;
    this.encryptionFactory = encryptionFactory;
    this.remoteFactory = remoteFactory;
    this.archiveFactory = archiveFactory;
  }
  create(settings) {
    const vaultPath = nodePath.resolve(settings.vaultDirectory.trim() || this.currentVaultPath);
    const strategySettings = {
      ...settings,
      ageIdentityPath: settings.ageIdentityPath.trim() ? nodePath.resolve(vaultPath, settings.ageIdentityPath) : ""
    };
    return new ResolvedConfig(
      settings,
      vaultPath,
      this.fileSystem,
      this.namingFactory.create(strategySettings, this.ui),
      this.encryptionFactory.create(strategySettings, this.fileSystem, this.runner),
      this.remoteFactory.create(strategySettings, this.runner),
      this.archiveFactory.create(this.runner),
      this.runner
    );
  }
};

// src/domain.ts
var DEFAULT_SETTINGS = {
  vaultDirectory: "",
  backupDirectory: "",
  backupGitDirectory: "",
  excludedVaultPaths: [],
  excludeVaultGit: true,
  namingStrategy: "dated",
  sameArchiveName: "vault-backup",
  dateFormat: "YYYY-MM-DD_HH-mm-ss",
  encryptionStrategy: "age",
  ageRecipient: "",
  ageIdentityPath: "",
  remoteStrategy: "none",
  remotePullUrl: "",
  remotePushUrl: ""
};

// src/obsidian-adapter.ts
var import_obsidian = require("obsidian");
var TextPromptModal = class extends import_obsidian.Modal {
  constructor(app, title, suggested, resolveValue) {
    super(app);
    this.resolveValue = resolveValue;
    this.settled = false;
    this.title = title;
    this.value = suggested;
  }
  onOpen() {
    this.titleEl.setText(this.title);
    new import_obsidian.Setting(this.contentEl).setName("Archive name").addText((text) => text.setValue(this.value).onChange((value) => {
      this.value = value;
    }));
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Create backup").setCta().onClick(() => {
      this.settled = true;
      this.resolveValue(this.value);
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
};
var RestoreModal = class extends import_obsidian.Modal {
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
    new import_obsidian.Setting(this.contentEl).setName("Backup archive").addDropdown((dropdown) => {
      this.archives.forEach((archive) => dropdown.addOption(archive.path, nodePath.basename(archive.path)));
      dropdown.setValue(this.archivePath).onChange((value) => {
        this.archivePath = value;
      });
    });
    new import_obsidian.Setting(this.contentEl).setName("Destination in current vault").setDesc("A relative folder path. The archived vault folder will be created inside it.").addText((text) => text.setValue(this.destination).onChange((value) => {
      this.destination = value;
    }));
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Restore").setWarning().onClick(() => {
      const archive = this.archives.find((item) => item.path === this.archivePath);
      if (!archive) return;
      this.settled = true;
      this.resolveValue({ archive, destination: this.destination });
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
};
var ConfigurationModal = class extends import_obsidian.Modal {
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
    new import_obsidian.Setting(this.contentEl).setName("Archive naming").addDropdown((d) => d.addOption("same-delete", "Same name, delete commit first").addOption("same-overwrite", "Same name, overwrite").addOption("dated", "Date-formatted name").addOption("custom", "Prompt for name").setValue(this.draft.namingStrategy).onChange((v) => this.draft.namingStrategy = v));
    this.text("Same archive name", "vault-backup", this.draft.sameArchiveName, (v) => this.draft.sameArchiveName = v);
    this.text("Date format", "YYYY-MM-DD_HH-mm-ss", this.draft.dateFormat, (v) => this.draft.dateFormat = v);
    new import_obsidian.Setting(this.contentEl).setName("Encryption").addDropdown((d) => d.addOption("age", "age").addOption("none", "None").setValue(this.draft.encryptionStrategy).onChange((v) => this.draft.encryptionStrategy = v));
    this.text("age recipient", "age1...", this.draft.ageRecipient, (v) => this.draft.ageRecipient = v);
    this.text("age identity path", "/path/to/identity.txt", this.draft.ageIdentityPath, (v) => this.draft.ageIdentityPath = v);
    new import_obsidian.Setting(this.contentEl).setName("Remote").addDropdown((d) => d.addOption("none", "None").addOption("git", "Git push/pull").setValue(this.draft.remoteStrategy).onChange((v) => this.draft.remoteStrategy = v));
    this.text("Remote pull URL", "git@example.com:owner/backups.git", this.draft.remotePullUrl, (v) => this.draft.remotePullUrl = v);
    this.text("Remote push URL", "Defaults to pull URL", this.draft.remotePushUrl, (v) => this.draft.remotePushUrl = v);
    new import_obsidian.Setting(this.contentEl).addButton((button) => button.setButtonText("Save configuration").setCta().onClick(() => {
      this.settled = true;
      this.resolveValue(this.draft);
      this.close();
    }));
  }
  text(name, placeholder, value, update) {
    new import_obsidian.Setting(this.contentEl).setName(name).addText((text) => text.setPlaceholder(placeholder).setValue(value).onChange(update));
  }
  toggle(name, value, update) {
    new import_obsidian.Setting(this.contentEl).setName(name).addToggle((toggle) => toggle.setValue(value).onChange(update));
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) this.resolveValue(null);
  }
};
var ObsidianUserInteraction = class {
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
  notice(message, timeout) {
    new import_obsidian.Notice(message, timeout);
  }
};

// src/strategies.ts
function safeName(value) {
  const cleaned = value.trim().replace(/\.tar\.gz(?:\.age)?$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Archive name must contain at least one letter or number.");
  return cleaned;
}
function formatDate(date, format) {
  const values = {
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
    HH: String(date.getHours()).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ss: String(date.getSeconds()).padStart(2, "0")
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}
var FixedNamingStrategy = class {
  constructor(name, replacementMode) {
    this.name = name;
    this.replacementMode = replacementMode;
  }
  async nextArchiveName() {
    return safeName(this.name);
  }
};
var DatedNamingStrategy = class {
  constructor(format) {
    this.format = format;
    this.replacementMode = "unique";
  }
  async nextArchiveName(context) {
    return `${safeName(context.vaultName)}-${safeName(formatDate(context.now, this.format))}`;
  }
};
var CustomNamingStrategy = class {
  constructor(ui) {
    this.ui = ui;
    this.replacementMode = "unique";
  }
  async nextArchiveName(context) {
    const value = await this.ui.promptArchiveName(`${context.vaultName}-backup`);
    if (value === null) throw new Error("Backup cancelled.");
    return safeName(value);
  }
};
var DefaultNamingStrategyFactory = class {
  create(settings, ui) {
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
};
var NoEncryptionStrategy = class {
  constructor(fileSystem) {
    this.fileSystem = fileSystem;
    this.extension = "";
  }
  async validate() {
  }
  async encryptFile(source, destinationPath) {
    await this.fileSystem.move(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }
  async decryptFile(source, destinationPath) {
    await this.fileSystem.copy(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }
};
var AgeEncryptionStrategy = class {
  constructor(recipient, identityPath, fileSystem, runner) {
    this.recipient = recipient;
    this.identityPath = identityPath;
    this.fileSystem = fileSystem;
    this.runner = runner;
    this.extension = ".age";
  }
  async validate() {
    if (!this.recipient.trim()) throw new Error("An age recipient is required for encrypted backups.");
    if (!await this.runner.available("age")) throw new Error("age is not installed or is not available on PATH.");
  }
  async encryptFile(source, destinationPath) {
    await this.runner.run("age", ["-r", this.recipient, "-o", destinationPath, source.path]);
    await this.fileSystem.remove(source.path);
    return this.fileSystem.file(destinationPath);
  }
  async decryptFile(source, destinationPath) {
    if (!this.identityPath.trim()) throw new Error("An age identity path is required to restore an encrypted backup.");
    await this.runner.run("age", ["-d", "-i", this.identityPath, "-o", destinationPath, source.path]);
    return this.fileSystem.file(destinationPath);
  }
};
var DefaultEncryptionStrategyFactory = class {
  create(settings, fileSystem, runner) {
    return settings.encryptionStrategy === "age" ? new AgeEncryptionStrategy(settings.ageRecipient, settings.ageIdentityPath, fileSystem, runner) : new NoEncryptionStrategy(fileSystem);
  }
};
var TarArchiveStrategy = class {
  constructor(runner) {
    this.runner = runner;
  }
  async createArchive(source, destinationPath, excludedPaths) {
    const parent = nodePath.dirname(source.path);
    const root = nodePath.basename(source.path);
    const excludeArgs = excludedPaths.map((excluded) => `--exclude=${root}/${excluded.replace(/^\.?\//, "").replace(/\/$/, "")}`);
    await this.runner.run("tar", ["-czf", destinationPath, ...excludeArgs, "-C", parent, root]);
    return { path: destinationPath, read: async () => {
      const fs2 = require("node:fs");
      return fs2.promises.readFile(destinationPath);
    } };
  }
  async restoreArchive(archive, destination) {
    const listing = await this.runner.run("tar", ["-tzf", archive.path]);
    const unsafe = listing.stdout.split(/\r?\n/).filter(Boolean).find((entry) => {
      const normalized = entry.replace(/\\/g, "/");
      return normalized.startsWith("/") || normalized.split("/").includes("..");
    });
    if (unsafe) throw new Error(`Archive contains an unsafe path: ${unsafe}`);
    await this.runner.run("tar", ["-xzf", archive.path, "-C", destination.path]);
  }
};
var TarArchiveStrategyFactory = class {
  create(runner) {
    return new TarArchiveStrategy(runner);
  }
};
var NoRemoteStrategy = class {
  async push() {
    throw new Error("No remote strategy is configured.");
  }
  async pull() {
    throw new Error("No remote strategy is configured.");
  }
};
var GitRemoteStrategy = class {
  constructor(pullUrl, pushUrl, runner) {
    this.pullUrl = pullUrl;
    this.pushUrl = pushUrl;
    this.runner = runner;
  }
  async configure(repository) {
    if (!this.pullUrl.trim()) throw new Error("A Git remote pull URL is required.");
    let hasOrigin = true;
    try {
      await this.runner.run("git", ["remote", "get-url", "origin"], repository.path);
    } catch (e) {
      hasOrigin = false;
    }
    if (hasOrigin) {
      await this.runner.run("git", ["remote", "set-url", "origin", this.pullUrl], repository.path);
    } else {
      await this.runner.run("git", ["remote", "add", "origin", this.pullUrl], repository.path);
    }
    await this.runner.run("git", ["remote", "set-url", "--push", "origin", this.pushUrl.trim() || this.pullUrl], repository.path);
  }
  async push(repository) {
    await this.configure(repository);
    await this.runner.run("git", ["push", "-u", "origin", "HEAD"], repository.path);
  }
  async pull(repository) {
    await this.configure(repository);
    const branch = (await this.runner.run("git", ["branch", "--show-current"], repository.path)).stdout.trim();
    if (!branch) throw new Error("The backup repository has no current branch to pull.");
    await this.runner.run("git", ["pull", "--ff-only", "origin", branch], repository.path);
  }
};
var DefaultRemoteStrategyFactory = class {
  create(settings, runner) {
    return settings.remoteStrategy === "git" ? new GitRemoteStrategy(settings.remotePullUrl, settings.remotePushUrl, runner) : new NoRemoteStrategy();
  }
};

// src/main.ts
var VaultArchivePlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.running = false;
  }
  async onload() {
    var _a;
    this.settings = { ...DEFAULT_SETTINGS, ...(_a = await this.loadData()) != null ? _a : {} };
    this.register("backup", "Backup vault", new BackupCommand());
    this.register("push", "Push backup repository", new PushCommand());
    this.register("pull", "Pull backup repository", new PullCommand());
    this.register("full-backup", "Full backup (backup and push)", new FullBackupCommand());
    this.register("restore", "Restore vault backup", new RestoreCommand());
    this.register("configure-backup", "Configure backup", new ConfigureBackupCommand());
  }
  register(id, name, command) {
    this.addCommand({ id, name, callback: () => this.handleCommand(command) });
  }
  async handleCommand(command) {
    if (this.running) {
      new import_obsidian2.Notice("A backup command is already running.");
      return;
    }
    this.running = true;
    const ui = new ObsidianUserInteraction(this.app);
    const fileSystem = new NodeFileSystem();
    const runner = new NodeProcessRunner();
    const vaultPath = this.app.vault.adapter.basePath;
    if (!vaultPath) {
      this.running = false;
      new import_obsidian2.Notice("This plugin requires a local desktop vault.", 5e3);
      return;
    }
    const configFactory = new DefaultConfigFactory(
      vaultPath,
      fileSystem,
      runner,
      ui,
      new DefaultNamingStrategyFactory(),
      new DefaultEncryptionStrategyFactory(),
      new DefaultRemoteStrategyFactory(),
      new TarArchiveStrategyFactory()
    );
    const context = {
      config: configFactory.create(this.settings),
      fileSystem,
      repository: new GitBackupRepository(runner),
      ui,
      saveSettings: async (settings) => {
        this.settings = settings;
        await this.saveData(settings);
      }
    };
    try {
      await command.invoke(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian2.Notice(`Vault backup failed: ${message}`, 1e4);
      console.error("Vault Archive plugin command failed", error);
    } finally {
      this.running = false;
    }
  }
};
