# Safe Vault

Safe Vault is an Obsidian backup plugin for creating archive-based backups of your vault.

Backups can optionally be encrypted and version-controlled, making it possible to keep local backup snapshots as well as store them in a Git repository.

Safe Vault currently uses:

* `tar` for creating and extracting archives
* `age` for optional encryption
* `git` for version control and remote synchronization

These tools must be installed on your system and available on your `PATH` before their corresponding Safe Vault features can be used.

## Features

Safe Vault supports:

* Creating backups of your Obsidian vault
* Excluding selected files and directories from backups
* Encrypting backups using `age`
* Managing backups with Git
* Pushing backups to a remote Git repository
* Pulling backup updates from a remote repository
* Restoring a vault from an existing backup

## Commands

Safe Vault provides the following commands:

### Backup

Creates a new archive of the current vault using the configured backup settings.

### Push

Pushes the backup repository to its configured Git remote.

### Pull

Pulls the latest changes from the configured Git remote.

### Backup and Push

Creates a new backup and then pushes the updated backup repository to its configured remote.

### Restore from Backup

Restores the vault from an existing Safe Vault backup.

## Configuration

### Directories

#### Backup Directory

Specifies where Safe Vault should store backup archives.

The backup directory must be located **outside the current vault directory**.

For example:

```text
Documents/
├── MyVault/
│   ├── Notes/
│   └── Attachments/
│
└── VaultBackups/
```

In this example, `VaultBackups` can be used as the backup directory because it is outside `MyVault`.

#### Excluded Paths

Specifies files or directories that should not be included in the archive.

Excluded paths are specified relative to the vault root.

For example:

```text
.obsidian/workspace.json
Attachments/temp
private-notes
```

Paths currently use exact relative path matching.

**Wildcards are not supported.**

---

## Archive

Safe Vault allows you to configure how backup archive files are named.

### Naming Strategy

Available naming strategies include:

#### Same Name

Every backup uses the same configured archive name.

For example:

```text
vault-backup.tar.gz
```

If an archive with the same name already exists, Safe Vault can handle it using one of the following strategies:

* **Overwrite** — replace the existing archive
* **Delete then create new** — delete the existing archive before creating the new one

`Delete then create new` is the default behaviour.

#### Date Formatted

Generates archive names using the date and time of the backup.

For example:

```text
vault-backup-2026-08-30.tar.gz
```

This is useful when you want to retain multiple backup snapshots.

#### Prompt Before Backup

Prompts for the archive name before creating each backup.

This is useful when you want to assign descriptive names to individual backups.

---

## Encryption

Safe Vault supports optional backup encryption using [`age`](https://age-encryption.org/).

When encryption is enabled, the generated archive is encrypted before being stored in the backup directory.

Two encryption methods are supported.

### Password

Encrypts the archive using an `age` passphrase.

The same passphrase is required when restoring the backup.

This can be useful for simple personal backups where managing a separate identity file is unnecessary.

### Identity File

Uses an `age` public/private key pair.

This is the default encryption method.

The public recipient key is used when creating backups, while the corresponding private identity is required when decrypting and restoring them.

A new identity can be generated with:

```bash
age-keygen -o key.txt
```

The public recipient can be derived from the identity with:

```bash
age-keygen -y key.txt
```

Keep the identity file secure. Anyone with access to the private identity can decrypt backups encrypted for its corresponding recipient.

---

## System Requirements

Safe Vault relies on external command-line tools rather than bundling its own implementations.

Depending on the features you use, you will need:

```text
tar
age
git
```

Each required command must be available from your system `PATH`.

You can verify this from a terminal with:

```bash
tar --version
age --version
git --version
```

If a command is unavailable, the Safe Vault feature that depends on it will not work.

## Backup Workflow

A typical Safe Vault workflow is:

```text
Obsidian Vault
      │
      ▼
   Archive
     tar
      │
      ▼
Optional Encryption
     age
      │
      ▼
 Backup Directory
      │
      ▼
Optional Version Control
     git
      │
      ▼
  Remote Repository
```

For a simple local setup, you can use Safe Vault only for archive creation.

For a more complete backup strategy, you can combine archive creation, encryption, and Git synchronization.
