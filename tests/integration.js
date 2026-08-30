const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BackupCommand, PullCommand, PushCommand, RestoreCommand } = require("../.test-dist/src/commands/index.js");
const { DefaultConfigFactory } = require("../.test-dist/src/configs/index.js");
const {
  DEFAULT_SETTINGS,
  normalizeBackupSettings,
  normalizeExcludedVaultPaths,
} = require("../.test-dist/src/domain/config/index.js");
const { NodeFile, NodeFileSystem } = require("../.test-dist/src/adapters/node_file_system/index.js");
const { NodeProcessRunner } = require("../.test-dist/src/adapters/node_process_runner/index.js");
const {
  DefaultEncryptionStrategyFactory,
  TarArchiveStrategyFactory,
  generateAgeIdentityFiles,
} = require("../.test-dist/src/strategies/index.js");

async function testNodeFileSystemAndArchive(root) {
  const fileSystem = new NodeFileSystem();
  assert.equal(fileSystem.joinPath(root, "folder", "file.txt"), path.join(root, "folder", "file.txt"));
  assert.equal(fileSystem.resolvePath(root, "folder", "..", "file.txt"), path.resolve(root, "file.txt"));
  assert.equal(fileSystem.relativePath(root, path.join(root, "folder", "file.txt")), path.join("folder", "file.txt"));
  assert.equal(fileSystem.baseName(path.join(root, "folder", "file.txt")), "file.txt");
  assert.equal(fileSystem.parentPath(path.join(root, "folder", "file.txt")), path.join(root, "folder"));
  assert.equal(fileSystem.isAbsolutePath(root), true);
  assert.equal(fileSystem.isAbsolutePath("folder/file.txt"), false);

  const firstTemporaryFile = fileSystem.temporaryFile(".tar.gz");
  const secondTemporaryFile = fileSystem.temporaryFile(".tar.gz");
  assert.ok(firstTemporaryFile instanceof NodeFile);
  assert.equal(firstTemporaryFile.path.endsWith(".tar.gz"), true);
  assert.notEqual(firstTemporaryFile.path, secondTemporaryFile.path);
  assert.equal(await fileSystem.exists(firstTemporaryFile.path), false);
  assert.equal(await fileSystem.exists(secondTemporaryFile.path), false);

  const sourcePath = fileSystem.joinPath(root, "archive-source");
  const destinationPath = fileSystem.joinPath(root, "archive-restored");
  await fileSystem.ensureFolder(sourcePath);
  await fileSystem.ensureFolder(destinationPath);
  fs.writeFileSync(fileSystem.joinPath(sourcePath, "content.txt"), "archive content");
  const archiveStrategy = new TarArchiveStrategyFactory(new NodeProcessRunner(), fileSystem).create();
  try {
    const archive = await archiveStrategy.createArchive(fileSystem.folder(sourcePath), firstTemporaryFile.path, []);
    assert.ok(archive instanceof NodeFile);
    assert.ok((await archive.read()).byteLength > 0);
    await archiveStrategy.restoreArchive(archive, fileSystem.folder(destinationPath));
    assert.equal(
      fs.readFileSync(fileSystem.joinPath(destinationPath, "archive-source", "content.txt"), "utf8"),
      "archive content",
    );
  } finally {
    await fileSystem.remove(firstTemporaryFile.path);
    await fileSystem.remove(secondTemporaryFile.path);
  }
}

async function createContext(root, overrides, chooseRestore = async () => null) {
  const vault = path.join(root, "vault");
  const backupPath = path.join(root, "backups");
  fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
  fs.mkdirSync(backupPath, { recursive: true });
  fs.writeFileSync(path.join(vault, "note.md"), "# version one");
  fs.writeFileSync(path.join(vault, ".git", "excluded"), "secret");

  const settings = {
    ...DEFAULT_SETTINGS,
    vaultDirectory: vault,
    backupDirectory: backupPath,
    ...overrides,
  };
  const runner = new NodeProcessRunner();
  if (settings.versionControlStrategy === "git" || settings.remoteStrategy === "git") {
    await runner.run("git", ["init"], { cwd: backupPath });
    await runner.run("git", ["config", "user.email", "test@example.com"], { cwd: backupPath });
    await runner.run("git", ["config", "user.name", "Vault Archive Test"], { cwd: backupPath });
  }
  const fileSystem = new NodeFileSystem();
  const ui = {
    promptArchiveName: async () => null,
    chooseRestore,
    configure: async () => null,
    pickPath: async () => null,
    promptPassword: async () => null,
    notice: () => {},
  };
  const platformBridge = {
    getFileSystem: () => fileSystem,
    getProcessRunner: () => runner,
    getUserInteraction: () => ui,
  };
  const configFactory = new DefaultConfigFactory(
    vault,
    platformBridge,
  );
  return {
    vault,
    repositoryPath: backupPath,
    backupPath,
    runner,
    context: {
      config: configFactory.create(settings),
      saveSettings: async () => {},
    },
  };
}

async function testPlainBackupRestoreAndRemote(root) {
  fs.mkdirSync(path.join(root, "vault", "ignored-folder"), { recursive: true });
  fs.writeFileSync(path.join(root, "vault", "ignored-folder", "secret.txt"), "secret");
  fs.writeFileSync(path.join(root, "vault", "ignored-file.txt"), "secret");
  const fixture = await createContext(
    root,
    {
      namingStrategy: "same-delete",
      sameArchiveName: "fixed",
      encryptionStrategy: "none",
      excludedVaultPaths: [".git/", "ignored-folder/", "ignored-file.txt"],
    },
    async (archives) => ({ archive: archives[0], destination: "restored" }),
  );
  await new BackupCommand().invoke(fixture.context);
  fs.writeFileSync(path.join(fixture.vault, "note.md"), "# version two");
  await new BackupCommand().invoke(fixture.context);

  assert.equal((await fixture.runner.run("git", ["rev-list", "--count", "HEAD"], { cwd: fixture.repositoryPath })).stdout.trim(), "3");
  const archivePath = path.join(fixture.backupPath, "fixed.tar.gz");
  const listing = (await fixture.runner.run("tar", ["-tzf", archivePath])).stdout;
  assert.match(listing, /vault\/note.md/);
  assert.doesNotMatch(listing, /vault\/\.git/);
  assert.doesNotMatch(listing, /ignored-folder/);
  assert.doesNotMatch(listing, /ignored-file\.txt/);

  await new RestoreCommand().invoke(fixture.context);
  assert.equal(fs.readFileSync(path.join(fixture.vault, "restored", "vault", "note.md"), "utf8"), "# version two");

  const remotePath = path.join(root, "remote.git");
  await fixture.runner.run("git", ["init", "--bare", remotePath]);
  const remoteFixture = await createContext(root, {
    namingStrategy: "same-delete",
    sameArchiveName: "fixed",
    encryptionStrategy: "none",
    remoteStrategy: "git",
    remotePullUrl: remotePath,
  });
  await new PushCommand().invoke(remoteFixture.context);
  assert.match((await fixture.runner.run("git", ["show-ref"], { cwd: remotePath })).stdout, /refs\/heads\//);
  await new PullCommand().invoke(remoteFixture.context);
}

async function testDisabledVersionControl(root) {
  const fixture = await createContext(root, {
    namingStrategy: "same-overwrite",
    sameArchiveName: "unversioned",
    encryptionStrategy: "none",
    versionControlStrategy: "none",
    remoteStrategy: "none",
  });
  await new BackupCommand().invoke(fixture.context);
  assert.equal(fs.existsSync(path.join(fixture.backupPath, "unversioned.tar.gz")), true);
  assert.equal(fs.existsSync(path.join(fixture.backupPath, ".git")), false);
}

async function testSettingsAndAgeUtilities(root) {
  assert.deepEqual(normalizeExcludedVaultPaths(["./folder/", "file.txt", "file.txt", ""]), ["folder/", "file.txt"]);
  assert.throws(() => normalizeExcludedVaultPaths(["*.tmp"]), /wildcards/);
  assert.throws(() => normalizeExcludedVaultPaths(["/absolute"]), /relative/);
  assert.throws(() => normalizeExcludedVaultPaths(["folder/../secret"]), /traverse/);
  const normalized = normalizeBackupSettings({
    remoteStrategy: "git",
    versionControlStrategy: "none",
    unknownSetting: "discarded",
  });
  assert.equal(normalized.versionControlStrategy, "git");
  assert.equal(Object.hasOwn(normalized, "unknownSetting"), false);

  const fileSystem = new NodeFileSystem();
  const identityPath = path.join(root, "generated-identity.txt");
  const keyRunner = {
    available: async () => true,
    run: async (_command, args) => {
      if (args[0] === "-o") await fileSystem.file(args[1]).write("AGE-SECRET-KEY-TEST\n");
      return { stdout: args[0] === "-y" ? "age1generated\n" : "", stderr: "", exitCode: 0 };
    },
  };
  const generated = await generateAgeIdentityFiles(identityPath, fileSystem, keyRunner);
  assert.equal(generated.recipientPath, `${identityPath}.pub`);
  assert.equal(generated.recipient, "age1generated");
  assert.equal(fs.readFileSync(generated.recipientPath, "utf8"), "age1generated\n");
  await assert.rejects(() => generateAgeIdentityFiles(identityPath, fileSystem, keyRunner), /already exists/);

  const recipientPath = path.join(root, "recipients.txt");
  const sourcePath = path.join(root, "plain.tar.gz");
  fs.writeFileSync(recipientPath, "age1fromfile\n");
  fs.writeFileSync(sourcePath, "archive");
  const calls = [];
  const encryptionRunner = {
    available: async () => true,
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: command === "age-keygen" ? "age1derived\n" : "", stderr: "", exitCode: 0 };
    },
  };
  const encryptionUi = { promptPassword: async () => null };
  const encryption = new DefaultEncryptionStrategyFactory(encryptionRunner, encryptionUi).create({
    ...DEFAULT_SETTINGS,
    ageRecipientPath: recipientPath,
    ageRecipient: "age1inline",
  }, fileSystem);
  await encryption.validate();
  await encryption.encryptFile(fileSystem.file(sourcePath), path.join(root, "encrypted.age"));
  assert.deepEqual(calls[0].args.slice(0, 2), ["-R", recipientPath]);

  const inlineSourcePath = path.join(root, "inline.tar.gz");
  fs.writeFileSync(inlineSourcePath, "archive");
  calls.length = 0;
  const inlineEncryption = new DefaultEncryptionStrategyFactory(encryptionRunner, encryptionUi).create({
    ...DEFAULT_SETTINGS,
    ageRecipientPath: "",
    ageRecipient: "age1inline",
    ageIdentityPath: identityPath,
  }, fileSystem);
  await inlineEncryption.validate();
  await inlineEncryption.encryptFile(fileSystem.file(inlineSourcePath), path.join(root, "inline.age"));
  assert.deepEqual(calls[0].args.slice(0, 2), ["-r", "age1inline"]);
  assert.equal(calls.some((call) => call.command === "age-keygen"), false);

  const identitySourcePath = path.join(root, "identity-only.tar.gz");
  fs.writeFileSync(identitySourcePath, "archive");
  calls.length = 0;
  const identityEncryption = new DefaultEncryptionStrategyFactory(encryptionRunner, encryptionUi).create({
    ...DEFAULT_SETTINGS,
    ageRecipientPath: "",
    ageRecipient: "",
    ageIdentityPath: identityPath,
  }, fileSystem);
  await identityEncryption.validate();
  await identityEncryption.encryptFile(fileSystem.file(identitySourcePath), path.join(root, "identity-only.age"));
  assert.equal(calls[0].command, "age-keygen");
  assert.deepEqual(calls[0].args, ["-y", identityPath]);
  assert.deepEqual(calls[1].args.slice(0, 2), ["-r", "age1derived"]);

  const recipientOnly = new DefaultEncryptionStrategyFactory(encryptionRunner, encryptionUi).create({
    ...DEFAULT_SETTINGS,
    ageRecipientPath: "",
    ageRecipient: "age1publiconly",
    ageIdentityPath: "",
  }, fileSystem);
  await recipientOnly.validate();
  await assert.rejects(
    () => recipientOnly.decryptFile(fileSystem.file(path.join(root, "public-only.age")), path.join(root, "restore.tar.gz")),
    /identity path is required/,
  );

  const passwordCalls = [];
  const passwords = ["strong-password", "strong-password"];
  const passwordRunner = {
    available: async () => true,
    run: async (command, args, options) => {
      passwordCalls.push({ command, args, options });
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };
  const passwordUi = { promptPassword: async () => passwords.shift() ?? null };
  const passwordEncryption = new DefaultEncryptionStrategyFactory(passwordRunner, passwordUi).create({
    ...DEFAULT_SETTINGS,
    encryptionStrategy: "password",
  }, fileSystem);
  await passwordEncryption.validate();
  const passwordSourcePath = path.join(root, "password.tar.gz");
  fs.writeFileSync(passwordSourcePath, "archive");
  const parentPassphrase = process.env.AGE_PASSPHRASE;
  await passwordEncryption.encryptFile(fileSystem.file(passwordSourcePath), path.join(root, "password.age"));
  await passwordEncryption.decryptFile(fileSystem.file(path.join(root, "password.age")), path.join(root, "password-restored.tar.gz"));
  assert.deepEqual(passwordCalls[0].args.slice(0, 4), ["-e", "-j", "batchpass", "-o"]);
  assert.deepEqual(passwordCalls[0].options.environment, { AGE_PASSPHRASE: "strong-password" });
  assert.deepEqual(passwordCalls[1].args.slice(0, 4), ["-d", "-j", "batchpass", "-o"]);
  assert.equal(process.env.AGE_PASSPHRASE, parentPassphrase);
  assert.equal(fs.existsSync(passwordSourcePath), false);

  const cancelledSourcePath = path.join(root, "cancelled.tar.gz");
  fs.writeFileSync(cancelledSourcePath, "archive");
  const cancelledEncryption = new DefaultEncryptionStrategyFactory(passwordRunner, {
    promptPassword: async () => null,
  }).create({ ...DEFAULT_SETTINGS, encryptionStrategy: "password" }, fileSystem);
  await assert.rejects(
    () => cancelledEncryption.encryptFile(fileSystem.file(cancelledSourcePath), path.join(root, "cancelled.age")),
    /cancelled/,
  );
  assert.equal(fs.existsSync(cancelledSourcePath), true);

  const missingPlugin = new DefaultEncryptionStrategyFactory({
    available: async (command) => command !== "age-plugin-batchpass",
    run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
  }, passwordUi).create({ ...DEFAULT_SETTINGS, encryptionStrategy: "password" }, fileSystem);
  await assert.rejects(() => missingPlugin.validate(), /age-plugin-batchpass/);

  const scopedResult = await new NodeProcessRunner().run(
    process.execPath,
    ["-e", "process.stdout.write(process.env.VAULT_ARCHIVE_TEST_SECRET || '')"],
    { environment: { VAULT_ARCHIVE_TEST_SECRET: "scoped" } },
  );
  assert.equal(scopedResult.stdout, "scoped");
  assert.equal(process.env.VAULT_ARCHIVE_TEST_SECRET, undefined);
}

async function testAgeBackupRestore(root) {
  const runner = new NodeProcessRunner();
  if (!(await runner.available("age")) || !(await runner.available("age-keygen"))) {
    process.stdout.write("age not available; encrypted integration test skipped\n");
    return;
  }
  const identityPath = path.join(root, "identity.txt");
  await runner.run("age-keygen", ["-o", identityPath]);
  const recipient = (await runner.run("age-keygen", ["-y", identityPath])).stdout.trim();
  const fixture = await createContext(
    root,
    {
      namingStrategy: "same-overwrite",
      sameArchiveName: "encrypted",
      encryptionStrategy: "age",
      ageRecipient: recipient,
      ageIdentityPath: identityPath,
    },
    async (archives) => ({ archive: archives[0], destination: "restored" }),
  );
  await new BackupCommand().invoke(fixture.context);
  assert.equal(fs.existsSync(path.join(fixture.backupPath, "encrypted.tar.gz.age")), true);
  await new RestoreCommand().invoke(fixture.context);
  assert.equal(fs.readFileSync(path.join(fixture.vault, "restored", "vault", "note.md"), "utf8"), "# version one");
}

(async () => {
  const roots = [];
  try {
    const plainRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-archive-plain-"));
    const ageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-archive-age-"));
    const fileSystemRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-archive-filesystem-"));
    const disabledRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-archive-disabled-"));
    const utilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vault-archive-utility-"));
    roots.push(plainRoot, ageRoot, fileSystemRoot, disabledRoot, utilityRoot);
    await testNodeFileSystemAndArchive(fileSystemRoot);
    await testPlainBackupRestoreAndRemote(plainRoot);
    await testDisabledVersionControl(disabledRoot);
    await testSettingsAndAgeUtilities(utilityRoot);
    await testAgeBackupRestore(ageRoot);
    process.stdout.write("Vault Archive integration tests passed\n");
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
