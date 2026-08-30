export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessRunner {
  run(command: string, args: string[], cwd?: string): Promise<ProcessResult>;
  available(command: string): Promise<boolean>;
}
