export type NamingStrategyKind = "same-delete" | "same-overwrite" | "dated" | "custom";
export type EncryptionStrategyKind = "none" | "age";
export type RemoteStrategyKind = "none" | "git";

export interface BackupSettings {
  vaultDirectory: string;
  backupDirectory: string;
  backupGitDirectory: string;
  excludedVaultPaths: string[];
  excludeVaultGit: boolean;
  namingStrategy: NamingStrategyKind;
  sameArchiveName: string;
  dateFormat: string;
  encryptionStrategy: EncryptionStrategyKind;
  ageRecipient: string;
  ageIdentityPath: string;
  remoteStrategy: RemoteStrategyKind;
  remotePullUrl: string;
  remotePushUrl: string;
}

export const DEFAULT_SETTINGS: BackupSettings = {
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
  remotePushUrl: "",
};
