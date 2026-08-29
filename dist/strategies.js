"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultRemoteStrategyFactory = exports.TarArchiveStrategyFactory = exports.DefaultEncryptionStrategyFactory = exports.DefaultNamingStrategyFactory = void 0;
const node_adapters_1 = require("./node-adapters");
function safeName(value) {
    const cleaned = value.trim().replace(/\.tar\.gz(?:\.age)?$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!cleaned)
        throw new Error("Archive name must contain at least one letter or number.");
    return cleaned;
}
function formatDate(date, format) {
    const values = {
        YYYY: String(date.getFullYear()),
        MM: String(date.getMonth() + 1).padStart(2, "0"),
        DD: String(date.getDate()).padStart(2, "0"),
        HH: String(date.getHours()).padStart(2, "0"),
        mm: String(date.getMinutes()).padStart(2, "0"),
        ss: String(date.getSeconds()).padStart(2, "0"),
    };
    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}
class FixedNamingStrategy {
    constructor(name, replacementMode) {
        this.name = name;
        this.replacementMode = replacementMode;
    }
    async nextArchiveName() { return safeName(this.name); }
}
class DatedNamingStrategy {
    constructor(format) {
        this.format = format;
        this.replacementMode = "unique";
    }
    async nextArchiveName(context) {
        return `${safeName(context.vaultName)}-${safeName(formatDate(context.now, this.format))}`;
    }
}
class CustomNamingStrategy {
    constructor(ui) {
        this.ui = ui;
        this.replacementMode = "unique";
    }
    async nextArchiveName(context) {
        const value = await this.ui.promptArchiveName(`${context.vaultName}-backup`);
        if (value === null)
            throw new Error("Backup cancelled.");
        return safeName(value);
    }
}
class DefaultNamingStrategyFactory {
    create(settings, ui) {
        switch (settings.namingStrategy) {
            case "same-delete": return new FixedNamingStrategy(settings.sameArchiveName, "delete-first");
            case "same-overwrite": return new FixedNamingStrategy(settings.sameArchiveName, "overwrite");
            case "custom": return new CustomNamingStrategy(ui);
            default: return new DatedNamingStrategy(settings.dateFormat);
        }
    }
}
exports.DefaultNamingStrategyFactory = DefaultNamingStrategyFactory;
class NoEncryptionStrategy {
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
        this.extension = "";
    }
    async validate() { }
    async encryptFile(source, destinationPath) {
        await this.fileSystem.move(source.path, destinationPath);
        return this.fileSystem.file(destinationPath);
    }
    async decryptFile(source, destinationPath) {
        await this.fileSystem.copy(source.path, destinationPath);
        return this.fileSystem.file(destinationPath);
    }
}
class AgeEncryptionStrategy {
    constructor(recipient, identityPath, fileSystem, runner) {
        this.recipient = recipient;
        this.identityPath = identityPath;
        this.fileSystem = fileSystem;
        this.runner = runner;
        this.extension = ".age";
    }
    async validate() {
        if (!this.recipient.trim())
            throw new Error("An age recipient is required for encrypted backups.");
        if (!(await this.runner.available("age")))
            throw new Error("age is not installed or is not available on PATH.");
    }
    async encryptFile(source, destinationPath) {
        await this.runner.run("age", ["-r", this.recipient, "-o", destinationPath, source.path]);
        await this.fileSystem.remove(source.path);
        return this.fileSystem.file(destinationPath);
    }
    async decryptFile(source, destinationPath) {
        if (!this.identityPath.trim())
            throw new Error("An age identity path is required to restore an encrypted backup.");
        await this.runner.run("age", ["-d", "-i", this.identityPath, "-o", destinationPath, source.path]);
        return this.fileSystem.file(destinationPath);
    }
}
class DefaultEncryptionStrategyFactory {
    create(settings, fileSystem, runner) {
        return settings.encryptionStrategy === "age"
            ? new AgeEncryptionStrategy(settings.ageRecipient, settings.ageIdentityPath, fileSystem, runner)
            : new NoEncryptionStrategy(fileSystem);
    }
}
exports.DefaultEncryptionStrategyFactory = DefaultEncryptionStrategyFactory;
class TarArchiveStrategy {
    constructor(runner) {
        this.runner = runner;
    }
    async createArchive(source, destinationPath, excludedPaths) {
        const parent = node_adapters_1.nodePath.dirname(source.path);
        const root = node_adapters_1.nodePath.basename(source.path);
        const excludeArgs = excludedPaths.map((excluded) => `--exclude=${root}/${excluded.replace(/^\.?\//, "").replace(/\/$/, "")}`);
        await this.runner.run("tar", ["-czf", destinationPath, ...excludeArgs, "-C", parent, root]);
        return { path: destinationPath, read: async () => { const fs = require("node:fs"); return fs.promises.readFile(destinationPath); } };
    }
    async restoreArchive(archive, destination) {
        const listing = await this.runner.run("tar", ["-tzf", archive.path]);
        const unsafe = listing.stdout.split(/\r?\n/).filter(Boolean).find((entry) => {
            const normalized = entry.replace(/\\/g, "/");
            return normalized.startsWith("/") || normalized.split("/").includes("..");
        });
        if (unsafe)
            throw new Error(`Archive contains an unsafe path: ${unsafe}`);
        await this.runner.run("tar", ["-xzf", archive.path, "-C", destination.path]);
    }
}
class TarArchiveStrategyFactory {
    create(runner) { return new TarArchiveStrategy(runner); }
}
exports.TarArchiveStrategyFactory = TarArchiveStrategyFactory;
class NoRemoteStrategy {
    async push() { throw new Error("No remote strategy is configured."); }
    async pull() { throw new Error("No remote strategy is configured."); }
}
class GitRemoteStrategy {
    constructor(pullUrl, pushUrl, runner) {
        this.pullUrl = pullUrl;
        this.pushUrl = pushUrl;
        this.runner = runner;
    }
    async configure(repository) {
        if (!this.pullUrl.trim())
            throw new Error("A Git remote pull URL is required.");
        let hasOrigin = true;
        try {
            await this.runner.run("git", ["remote", "get-url", "origin"], repository.path);
        }
        catch {
            hasOrigin = false;
        }
        if (hasOrigin) {
            await this.runner.run("git", ["remote", "set-url", "origin", this.pullUrl], repository.path);
        }
        else {
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
        if (!branch)
            throw new Error("The backup repository has no current branch to pull.");
        await this.runner.run("git", ["pull", "--ff-only", "origin", branch], repository.path);
    }
}
class DefaultRemoteStrategyFactory {
    create(settings, runner) {
        return settings.remoteStrategy === "git"
            ? new GitRemoteStrategy(settings.remotePullUrl, settings.remotePushUrl, runner)
            : new NoRemoteStrategy();
    }
}
exports.DefaultRemoteStrategyFactory = DefaultRemoteStrategyFactory;
