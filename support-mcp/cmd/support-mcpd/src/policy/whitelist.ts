import type { AppConfig, DatabaseConfig } from "../config.js";

export const ALLOWED_TOOLS = [
  "logs.tail",
  "logs.search",
  "service.status",
  "db.query",
  "db.explain"
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

export class PolicyEngine {
  constructor(private config: AppConfig) {}

  assertAllowed(name: string): asserts name is AllowedToolName {
    if (!ALLOWED_TOOLS.includes(name as AllowedToolName)) {
      throw new Error("tool denied by policy");
    }
  }

  resolveTarget(target: string, tool: AllowedToolName) {
    const resolved = this.config.targets[target];
    if (!resolved) throw new Error("unknown target");
    if (!resolved.allowed_tools.includes(tool)) throw new Error("target disallows this tool");
    return resolved;
  }

  resolveService(service: string) {
    const resolved = this.config.services[service];
    if (!resolved) throw new Error("unknown service");
    return resolved;
  }

  resolveHost(name: string) {
    const resolved = this.config.hosts[name];
    if (!resolved) throw new Error("unknown host");
    return resolved;
  }

  resolveDatasource(name: string): DatabaseConfig {
    const resolved = this.config.databases[name];
    if (!resolved) throw new Error("unknown datasource");
    if (!resolved.readonly) throw new Error("datasource must be readonly");
    return resolved;
  }
}
