import { spawn } from "node:child_process";

export type CommandRunOptions = {
  env?: NodeJS.ProcessEnv;
  allowExitCodes?: number[];
  maxOutputBytes?: number;
  mergeStderr?: boolean;
};

export class CommandRunner {
  constructor(private timeoutSec: number) {}

  run(cmd: string, args: string[], options: CommandRunOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const allowedExitCodes = options.allowExitCodes ?? [0];
      const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
      const child = spawn(cmd, args, {
        shell: false,
        env: options.env ? { ...process.env, ...options.env } : process.env
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;

      const finish = (err?: Error, output?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(output ?? "");
      };

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("command timeout"));
      }, this.timeoutSec * 1000);

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxOutputBytes) {
          child.kill("SIGKILL");
          finish(new Error("command output too large"));
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.length;
        if (options.mergeStderr) {
          stdoutBytes += chunk.length;
          if (stdoutBytes > maxOutputBytes) {
            child.kill("SIGKILL");
            finish(new Error("command output too large"));
            return;
          }
          stdoutChunks.push(chunk);
          return;
        }
        if (stderrBytes <= maxOutputBytes) stderrChunks.push(chunk);
      });

      child.on("error", (err) => finish(err));
      child.on("close", (code) => {
        if (settled) return;
        const exitCode = code ?? -1;
        const out = Buffer.concat(stdoutChunks).toString("utf8");
        const err = Buffer.concat(stderrChunks).toString("utf8");
        if (!allowedExitCodes.includes(exitCode)) {
          finish(new Error(err || `exit code ${exitCode}`));
          return;
        }
        finish(undefined, out);
      });
    });
  }
}
