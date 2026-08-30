export type NamingStrategyKind = "same-delete" | "same-overwrite" | "dated" | "custom";
export type EncryptionStrategyKind = "none" | "age" | "password";
export type VersionControlStrategyKind = "none" | "git";
export type RemoteStrategyKind = "none" | "git";

export interface BackupSettings {
  vaultDirectory: string;
  backupDirectory: string;
  excludedVaultPaths: string[];
  namingStrategy: NamingStrategyKind;
  sameArchiveName: string;
  dateFormat: string;
  encryptionStrategy: EncryptionStrategyKind;
  ageRecipientPath: string;
  ageRecipient: string;
  ageIdentityPath: string;
  versionControlStrategy: VersionControlStrategyKind;
  remoteStrategy: RemoteStrategyKind;
  remotePullUrl: string;
  remotePushUrl: string;
}

export const DEFAULT_SETTINGS: BackupSettings = {
  vaultDirectory: "",
  backupDirectory: "",
  excludedVaultPaths: [
    //".git/"
  ],
  namingStrategy: "same-delete",
  sameArchiveName: "vault-backup",
  dateFormat: "YYYY-MM-DD_HH-mm-ss",
  encryptionStrategy: "age",
  ageRecipientPath: "",
  ageRecipient: "",
  ageIdentityPath: "",
  versionControlStrategy: "git",
  remoteStrategy: "none",
  remotePullUrl: "",
  remotePushUrl: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(source: Record<string, unknown>, key: keyof BackupSettings, fallback: string): string {
  return typeof source[key] === "string" ? source[key] : fallback;
}

function enumValue<T extends string>(source: Record<string, unknown>, key: keyof BackupSettings, values: readonly T[], fallback: T): T {
  const value = source[key];
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

export function normalizeBackupSettings(value: unknown): BackupSettings {
  const source = isRecord(value) ? value : {};
  const exclusions = Array.isArray(source.excludedVaultPaths)
    ? source.excludedVaultPaths.filter((item): item is string => typeof item === "string")
    : [...DEFAULT_SETTINGS.excludedVaultPaths];

  const settings: BackupSettings = {
    vaultDirectory: stringValue(source, "vaultDirectory", DEFAULT_SETTINGS.vaultDirectory),
    backupDirectory: stringValue(source, "backupDirectory", DEFAULT_SETTINGS.backupDirectory),
    excludedVaultPaths: exclusions,
    namingStrategy: enumValue(source, "namingStrategy", ["same-delete", "same-overwrite", "dated", "custom"], DEFAULT_SETTINGS.namingStrategy),
    sameArchiveName: stringValue(source, "sameArchiveName", DEFAULT_SETTINGS.sameArchiveName),
    dateFormat: stringValue(source, "dateFormat", DEFAULT_SETTINGS.dateFormat),
    encryptionStrategy: enumValue(source, "encryptionStrategy", ["none", "age", "password"], DEFAULT_SETTINGS.encryptionStrategy),
    ageRecipientPath: stringValue(source, "ageRecipientPath", DEFAULT_SETTINGS.ageRecipientPath),
    ageRecipient: stringValue(source, "ageRecipient", DEFAULT_SETTINGS.ageRecipient),
    ageIdentityPath: stringValue(source, "ageIdentityPath", DEFAULT_SETTINGS.ageIdentityPath),
    versionControlStrategy: enumValue(source, "versionControlStrategy", ["none", "git"], DEFAULT_SETTINGS.versionControlStrategy),
    remoteStrategy: enumValue(source, "remoteStrategy", ["none", "git"], DEFAULT_SETTINGS.remoteStrategy),
    remotePullUrl: stringValue(source, "remotePullUrl", DEFAULT_SETTINGS.remotePullUrl),
    remotePushUrl: stringValue(source, "remotePushUrl", DEFAULT_SETTINGS.remotePushUrl),
  };
  if (settings.remoteStrategy === "git") settings.versionControlStrategy = "git";
  return settings;
}

export function normalizeExcludedVaultPaths(paths: Iterable<string>): string[] {
  const normalized: string[] = [];
  for (const input of paths) {
    const path = input.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!path) continue;
    if (path.startsWith("/") || /^[A-Za-z]:\//.test(path)) throw new Error(`Excluded path must be relative: ${input}`);
    if (path.split("/").includes("..")) throw new Error(`Excluded path cannot traverse outside the vault: ${input}`);
    if (/[*?\[\]{}]/.test(path)) throw new Error(`Excluded path cannot contain wildcards: ${input}`);
    if (!normalized.includes(path)) normalized.push(path);
  }
  return normalized;
}
