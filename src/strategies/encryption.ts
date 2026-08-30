import type { BackupSettings } from "../domain/config";
import type { FileProxy, FileSystem } from "../domain/file_system";
import type { EncryptionStrategy } from "../domain/strategies";
import type { ProcessRunner } from "../domain/process_runner";
import type { UserInteraction } from "../domain/user_interaction";

class NoEncryptionStrategy implements EncryptionStrategy {
  readonly extension = "";

  constructor(private readonly fileSystem: FileSystem) {}

  async validate(): Promise<void> {}

  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.fileSystem.move(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }

  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.fileSystem.copy(source.path, destinationPath);
    return this.fileSystem.file(destinationPath);
  }
}

class AgeEncryptionStrategy implements EncryptionStrategy {
  readonly extension = ".age";

  constructor(
    private readonly recipientPath: string,
    private readonly recipient: string,
    private readonly identityPath: string,
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
  ) {}

  async validate(): Promise<void> {
    if (!this.recipientPath.trim() && !this.recipient.trim() && !this.identityPath.trim()) {
      throw new Error("An age recipient file, recipient value, or identity file is required for encrypted backups.");
    }
    if (this.recipientPath.trim() && !(await this.fileSystem.exists(this.recipientPath))) {
      throw new Error(`Age recipient file does not exist: ${this.recipientPath}`);
    }
    if (this.identityPath.trim() && !(await this.fileSystem.exists(this.identityPath))) {
      throw new Error(`Age identity file does not exist: ${this.identityPath}`);
    }
    if (!(await this.runner.available("age"))) throw new Error("age is not installed or is not available on PATH.");
    if (!this.recipientPath.trim() && !this.recipient.trim() && !(await this.runner.available("age-keygen"))) {
      throw new Error("age-keygen is required to derive a recipient from the configured identity.");
    }
  }

  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    let recipientArgs: string[];
    if (this.recipientPath.trim()) {
      recipientArgs = ["-R", this.recipientPath];
    } else if (this.recipient.trim()) {
      recipientArgs = ["-r", this.recipient];
    } else {
      const recipient = (await this.runner.run("age-keygen", ["-y", this.identityPath])).stdout.trim();
      if (!recipient) throw new Error("age-keygen did not return a recipient for the configured identity.");
      recipientArgs = ["-r", recipient];
    }
    await this.runner.run("age", [...recipientArgs, "-o", destinationPath, source.path]);
    await this.fileSystem.remove(source.path);
    return this.fileSystem.file(destinationPath);
  }

  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    if (!this.identityPath.trim()) throw new Error("An age identity path is required to restore an encrypted backup.");
    await this.runner.run("age", ["-d", "-i", this.identityPath, "-o", destinationPath, source.path]);
    return this.fileSystem.file(destinationPath);
  }
}

class PasswordEncryptionStrategy implements EncryptionStrategy {
  readonly extension = ".age";

  constructor(
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
    private readonly ui: UserInteraction,
  ) {}

  async validate(): Promise<void> {
    if (!(await this.runner.available("age"))) throw new Error("age is not installed or is not available on PATH.");
    if (!(await this.runner.available("age-plugin-batchpass"))) {
      throw new Error("age-plugin-batchpass is not installed or is not available on PATH.");
    }
  }

  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    const password = await this.requestPassword("Encrypt backup", true);
    await this.runner.run(
      "age",
      ["-e", "-j", "batchpass", "-o", destinationPath, source.path],
      { environment: { AGE_PASSPHRASE: password } },
    );
    await this.fileSystem.remove(source.path);
    return this.fileSystem.file(destinationPath);
  }

  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    const password = await this.requestPassword("Decrypt backup", false);
    await this.runner.run(
      "age",
      ["-d", "-j", "batchpass", "-o", destinationPath, source.path],
      { environment: { AGE_PASSPHRASE: password } },
    );
    return this.fileSystem.file(destinationPath);
  }

  private async requestPassword(title: string, confirm: boolean): Promise<string> {
    const password = await this.ui.promptPassword({ title, confirm });
    if (password === null) throw new Error("Password entry cancelled.");
    if (!password) throw new Error("Password cannot be empty.");
    return password;
  }
}

export class DefaultEncryptionStrategyFactory {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly ui: UserInteraction,
  ) {}

  create(settings: BackupSettings, fileSystem: FileSystem): EncryptionStrategy {
    switch (settings.encryptionStrategy) {
      case "age":
        return new AgeEncryptionStrategy(settings.ageRecipientPath, settings.ageRecipient, settings.ageIdentityPath, fileSystem, this.runner);
      case "password":
        return new PasswordEncryptionStrategy(fileSystem, this.runner, this.ui);
      default:
        return new NoEncryptionStrategy(fileSystem);
    }
  }
}
