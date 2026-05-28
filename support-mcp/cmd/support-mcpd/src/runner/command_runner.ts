import { spawn } from "node:child_process";

export class CommandRunner {
  constructor(private timeoutSec: number) {}

  run(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { shell: false });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        p.kill("SIGKILL");
        reject(new Error("command timeout"));
      }, this.timeoutSec * 1000);

      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(err || `exit code ${code}`));
        resolve(out);
      });
    });
  }
}
