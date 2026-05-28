import { PolicyEngine } from "../policy/whitelist.js";
import { CommandRunner } from "../runner/command_runner.js";
import { Redactor } from "../redact/redact.js";
import { AuditLogger } from "../audit/audit_logger.js";

export class ToolHandlers {
  private policy: PolicyEngine;
  private runner: CommandRunner;
  private redactor: Redactor;
  private audit: AuditLogger;

  constructor(private config: any) {
    this.policy = new PolicyEngine(config);
    this.runner = new CommandRunner(config.limits.command_timeout_sec);
    this.redactor = new Redactor();
    this.audit = new AuditLogger(config.server.audit_log);
  }

  listTools() {
    return [
      { name: "logs.tail", description: "tail whitelisted logs" },
      { name: "logs.search", description: "search whitelisted logs by fixed string" },
      { name: "service.status", description: "check whitelisted service status" }
    ];
  }

  async call(name: string, args: any) {
    this.policy.assertAllowed(name, args);
    let output = "";

    if (name === "logs.tail") {
      const target = this.policy.resolveTarget(args.target, name);
      const lines = Math.min(Number(args.lines ?? 200), this.config.limits.logs_tail_max_lines);
      output = await this.runner.run("/usr/bin/tail", ["-n", String(lines), target.path]);
    } else if (name === "logs.search") {
      const target = this.policy.resolveTarget(args.target, name);
      const keyword = String(args.keyword ?? "").slice(0, 200);
      output = await this.runner.run("/usr/bin/grep", ["-F", "--", keyword, target.path]);
    } else if (name === "service.status") {
      const service = this.policy.resolveService(args.service);
      output = await this.runner.run("/usr/bin/systemctl", ["is-active", service.unit]);
    } else {
      throw new Error(`tool not allowed: ${name}`);
    }

    const redacted = this.redactor.apply(output);
    const clipped = redacted.slice(0, this.config.security.max_response_bytes);
    this.audit.write({ tool: name, args, size: clipped.length, at: new Date().toISOString() });
    return { content: clipped, truncated: clipped.length < redacted.length };
  }
}
