import type { FileSystem } from "../domain/file_system";
import type { ProcessRunner } from "../domain/process_runner";

export interface GeneratedAgeIdentity {
  identityPath: string;
  recipientPath: string;
  recipient: string;
}

export async function generateAgeIdentityFiles(
  identityPath: string,
  fileSystem: FileSystem,
  runner: ProcessRunner,
): Promise<GeneratedAgeIdentity> {
  const recipientPath = `${identityPath}.pub`;
  if (await fileSystem.exists(identityPath)) throw new Error("The selected identity file already exists.");
  if (await fileSystem.exists(recipientPath)) throw new Error(`The recipient file already exists: ${recipientPath}`);

  try {
    await runner.run("age-keygen", ["-o", identityPath]);
    const recipient = (await runner.run("age-keygen", ["-y", identityPath])).stdout.trim();
    if (!recipient) throw new Error("age-keygen did not return a recipient.");
    await fileSystem.file(recipientPath).write(`${recipient}\n`);
    return { identityPath, recipientPath, recipient };
  } catch (error) {
    await fileSystem.remove(identityPath);
    await fileSystem.remove(recipientPath);
    throw error;
  }
}
