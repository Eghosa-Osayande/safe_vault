"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.DEFAULT_SETTINGS = {
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
