# Safe Vault: Encrypted Archives for Obsidian

Safe Vault is a desktop-only Obsidian plugin that creates compressed vault snapshots, optionally encrypts them with `age`, commits them to a separate Git repository, and can synchronize that repository with a remote.


## Requirements

- Obsidian desktop
- `git` and `tar` available on `PATH`
- `age` available on `PATH` when age encryption is selected
- Git author name and email configured for the backup repository

## Commands

- **Backup vault** creates and commits an archive.
- **Push backup repository** pushes the current backup branch to `origin`.
- **Pull backup repository** fast-forwards the current backup branch from `origin`.
- **Full backup** creates a backup and then pushes it.
- **Restore vault backup** selects an archive and restores it under a folder in the current vault.
- **Configure backup** opens the plugin configuration form.

Run **Configure backup** before the first backup. The vault directory can be left empty to use the current vault. Relative paths are resolved from the current vault. The backup Git directory must be the backup directory or one of its parents, and it must not overlap the vault directory. If it is not already a Git repository, the plugin initializes it.

## Naming and encryption

The naming strategies are fixed-name with a separate delete commit, fixed-name overwrite, date-formatted, and a custom name prompt. Archives use `tar.gz`; age-encrypted archives append `.age`.

For age backups, configure an age recipient. Restoring also requires the path to a matching age identity file. Secrets are not copied into the archive by the plugin, but configuration is stored in Obsidian's plugin data like other plugin settings.

