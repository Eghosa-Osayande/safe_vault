const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BackupCommand, PullCommand, PushCommand, RestoreCommand } = require("../src/commands.js");
const { DefaultConfigFactory } = require("../src/config.js");
const { DEFAULT_SETTINGS } = require("../src/domain.js");
const { GitBackupRepository, NodeFileSystem, NodeProcessRunner } = require("../src/node-adapters.js");
const {
  DefaultEncryptionStrategyFactory,
  DefaultNamingStrategyFactory,
  DefaultRemoteStrategyFactory,
  TarArchiveStrategyFactory,
} = require("../src/strategies.js");

async function createContext(root, overrides, chooseRestore = async () => null) {
  const vault = path.join(root, "vault");
  const repositoryPath = path.join(root, "backup-repo");
  const backupPath = path.join(repositoryPath, "archives");
  fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
  fs.mkdirSync(backupPath, { recursive: true });
  fs.writeFileSync(path.join(vault, "note.md"), "# version one");
  fs.writeFileSync(path.join(vault, ".git", "excluded"), "secret");

  const runner = new NodeProcessRunner();
  await runner.run("git", ["init"], repositoryPath);
  await runner.run("git", ["config", "user.email", "test@example.com"], repositoryPath);
  await runner.run("git", ["config", "user.name", "Vault Archive Test"], repositoryPath);
  const fileSystem = new NodeFileSystem();
  const ui = {
    promptArchiveName: async () => null,
    chooseRestore,
    configure: async () => null,
    notice: () => {},
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    vaultDirectory: vault,
    backupDirectory: backupPath,
    backupGitDirectory: repositoryPath,
    ...overrides,
  };
  const configFactory = new DefaultConfigFactory(
    vault,
    fileSystem,
    runner,
    ui,
    new DefaultNamingStrategyFactory(),
    new DefaultEncryptionStrategyFactory(),
    new DefaultRemoteStrategyFactory(),
    new TarArchiveStrategyFactory(),
  );
  return {
    vault,
    repositoryPath,
    backupPath,
    runner,
    context: {
      config: configFactory.create(settings),
      fileSystem,
      repository: new GitBackupRepository(runner),
      ui,
      saveSettings: async () => {},
    },
  };
}

async function testPlainBackupRestoreAndRemote(root) {
  const fixture = await createContext(
    root,
    { namingStrategy: "same-delete", sameArchiveName: "fixed", encryptionStrategy: "none" },
    async (archives) => ({ archive: archives[0], destination: "restored" }),
  );
  await new BackupCommand().invoke(fixture.context);
  fs.writeFileSync(path.join(fixture.vault, "note.md"), "# version two");
  await new BackupCommand().invoke(fixture.context);

  assert.equal((await fixture.runner.run("git", ["rev-list", "--count", "HEAD"], fixture.repositoryPath)).stdout.trim(), "3");
  const archivePath = path.join(fixture.backupPath, "fixed.tar.gz");
  const listing = (await fixture.runner.run("tar", ["-tzf", archivePath])).stdout;
  assert.match(listing, /vault\/note.md/);
  assert.doesNotMatch(listing, /vault\/\.git/);

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
  assert.match((await fixture.runner.run("git", ["show-ref"], remotePath)).stdout, /refs\/heads\//);
  await new PullCommand().invoke(remoteFixture.context);
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
    roots.push(plainRoot, ageRoot);
    await testPlainBackupRestoreAndRemote(plainRoot);
    await testAgeBackupRestore(ageRoot);
    process.stdout.write("Vault Archive integration tests passed\n");
  } finally {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
