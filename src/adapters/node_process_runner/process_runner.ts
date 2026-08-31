import { execFile } from "node:child_process";
import type { ProcessResult, ProcessRunner, ProcessRunOptions } from "../../domain/process_runner";

export class NodeProcessRunner implements ProcessRunner {
  async run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const currentPath = process.env.PATH || "";
      const env = {
        ...process.env,
        ...options.environment,
        PATH: ["/opt/homebrew/bin", "/usr/local/bin", currentPath].filter(Boolean).join(":"),
      };
      execFile(command, args, { cwd: options.cwd, env, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }
        const code = typeof error.code === "number" ? error.code : 1;
        reject(new Error(`${command} failed (${code}): ${(stderr || error.message).trim()}`));
      });
    });
  }

  async available(command: string): Promise<boolean> {
    try {
      await this.run(command, ["--version"]);
      return true;
    } catch {
      return false;
    }
  }
}
