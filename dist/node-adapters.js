"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodePath = exports.GitBackupRepository = exports.NodeProcessRunner = exports.NodeFileSystem = exports.NodeFolder = exports.NodeFile = void 0;
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
class NodeFile {
    constructor(path) {
        this.path = path;
    }
    async read() {
        return fs.promises.readFile(this.path);
    }
}
exports.NodeFile = NodeFile;
class NodeFolder {
    constructor(path) {
        this.path = path;
    }
    async getContents() {
        const entries = await fs.promises.readdir(this.path, { withFileTypes: true });
        return entries.map((entry) => {
            const entryPath = path.join(this.path, entry.name);
            return entry.isDirectory() ? new NodeFolder(entryPath) : new NodeFile(entryPath);
        });
    }
}
exports.NodeFolder = NodeFolder;
class NodeFileSystem {
    file(filePath) { return new NodeFile(filePath); }
    folder(folderPath) { return new NodeFolder(folderPath); }
    async exists(entityPath) {
        try {
            await fs.promises.access(entityPath);
            return true;
        }
        catch {
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
        }
        catch (error) {
            if (error.code !== "EXDEV")
                throw error;
            await fs.promises.copyFile(source, destination);
            await fs.promises.unlink(source);
        }
    }
    async remove(entityPath) {
        await fs.promises.rm(entityPath, { force: true });
    }
}
exports.NodeFileSystem = NodeFileSystem;
class NodeProcessRunner {
    async run(command, args, cwd) {
        return new Promise((resolve, reject) => {
            const currentPath = process.env.PATH || "";
            const env = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", currentPath].filter(Boolean).join(":"), };
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
        }
        catch {
            return false;
        }
    }
}
exports.NodeProcessRunner = NodeProcessRunner;
class GitBackupRepository {
    constructor(runner) {
        this.runner = runner;
    }
    async ensureRepository(repository) {
        try {
            const topLevel = (await this.runner.run("git", ["rev-parse", "--show-toplevel"], repository.path)).stdout.trim();
            if (path.resolve(topLevel) !== path.resolve(repository.path))
                await this.runner.run("git", ["init"], repository.path);
        }
        catch {
            await this.runner.run("git", ["init"], repository.path);
        }
    }
    async commitAll(repository, message) {
        await this.runner.run("git", ["add", "-A"], repository.path);
        try {
            await this.runner.run("git", ["diff", "--cached", "--quiet"], repository.path);
            return false;
        }
        catch {
            await this.runner.run("git", ["commit", "-m", message], repository.path);
            return true;
        }
    }
}
exports.GitBackupRepository = GitBackupRepository;
exports.nodePath = path;
