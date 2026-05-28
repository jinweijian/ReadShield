import fs from "node:fs";
import path from "node:path";

export class AuditLogger {
  constructor(private file: string) {}

  write(obj: Record<string, unknown>) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, JSON.stringify(obj) + "\n", "utf8");
    } catch {
      // 审计失败不影响主流程，但应该在后续接入告警
    }
  }
}
