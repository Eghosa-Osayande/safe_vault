# Vault Crypt: Encrypted Archives for Obsidian

Vault Archive is a desktop-only Obsidian plugin that creates compressed vault snapshots, optionally encrypts them with `age`, commits them to a separate Git repository, and can synchronize that repository with a remote.

The implementation is entirely TypeScript. It does not call the legacy `Makefile` or `backup.sh`, and it never runs Git commands in the vault repository.

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

## Build

From the repository root:

```sh
npm run build
```

Obsidian needs `manifest.json` and a built `main.js` in the plugin folder before it can load the plugin. For manual installation, copy these files into `.obsidian/plugins/vault-crypt/`:

- `manifest.json`
- `main.js`
- `styles.css`

If you are installing from the repository checkout instead of a release asset, run `npm run build` first so `main.js` exists, then reload Obsidian.

## Architecture

Domain interfaces are in `plugin/domain.ts`. Naming, encryption, archive, and remote behavior use strategy interfaces and factories. Commands contain the application workflows, configuration bridges saved settings to concrete strategies, Node adapters isolate filesystem/process/Git access, and the Obsidian adapter owns all modal and notice APIs.
