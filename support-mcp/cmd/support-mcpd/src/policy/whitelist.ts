export class PolicyEngine {
  constructor(private config: any) {}

  assertAllowed(name: string, _args: any) {
    const allowed = ["logs.tail", "logs.search", "service.status"];
    if (!allowed.includes(name)) throw new Error("tool denied by policy");
  }

  resolveTarget(target: string, tool: string) {
    const t = this.config.targets[target];
    if (!t) throw new Error("unknown target");
    if (!t.allowed_tools.includes(tool)) throw new Error("target disallows this tool");
    return t;
  }

  resolveService(service: string) {
    const s = this.config.services[service];
    if (!s) throw new Error("unknown service");
    return s;
  }
}
