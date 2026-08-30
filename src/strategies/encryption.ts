import type { BackupSettings } from "../domain/config";
import type { FileProxy, FileSystem } from "../domain/file_system";
import type { EncryptionStrategy } from "../domain/strategies";
import type { ProcessRunner } from "../domain/process_runner";

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
    private readonly recipient: string,
    private readonly identityPath: string,
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
  ) {}

  async validate(): Promise<void> {
    if (!this.recipient.trim()) throw new Error("An age recipient is required for encrypted backups.");
    if (!(await this.runner.available("age"))) throw new Error("age is not installed or is not available on PATH.");
  }

  async encryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    await this.runner.run("age", ["-r", this.recipient, "-o", destinationPath, source.path]);
    await this.fileSystem.remove(source.path);
    return this.fileSystem.file(destinationPath);
  }

  async decryptFile(source: FileProxy, destinationPath: string): Promise<FileProxy> {
    if (!this.identityPath.trim()) throw new Error("An age identity path is required to restore an encrypted backup.");
    await this.runner.run("age", ["-d", "-i", this.identityPath, "-o", destinationPath, source.path]);
    return this.fileSystem.file(destinationPath);
  }
}

export class DefaultEncryptionStrategyFactory {
  constructor(private readonly runner: ProcessRunner) {}

  create(settings: BackupSettings, fileSystem: FileSystem): EncryptionStrategy {
    return settings.encryptionStrategy === "age"
      ? new AgeEncryptionStrategy(settings.ageRecipient, settings.ageIdentityPath, fileSystem, this.runner)
      : new NoEncryptionStrategy(fileSystem);
  }
}
