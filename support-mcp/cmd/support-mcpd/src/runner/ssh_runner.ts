import type { HostConfig } from "../config.js";
import { CommandRunner } from "./command_runner.js";

export function shellQuote(value: string | number) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export class SshRunner {
  constructor(
    private commandRunner: CommandRunner,
    private sshBin: string
  ) {}

  run(host: HostConfig, remoteCommand: string, maxOutputBytes: number, mergeStderr = false) {
    return this.commandRunner.run(this.sshBin, [...host.options, host.destination, remoteCommand], {
      maxOutputBytes,
      mergeStderr
    });
  }
}
