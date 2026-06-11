import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type AuditEvent = {
  id: string;
  at: string;
  tool: string;
  status: "ok" | "error";
  args: unknown;
  elapsedMs: number;
  sizeBytes?: number;
  responsePreview?: string;
  error?: string;
};

export class AuditLogger {
  constructor(private file: string) {}

  nextId() {
    return crypto.randomUUID();
  }

  write(event: AuditEvent) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(event)}\n`, "utf8");
    } catch (err) {
      process.stderr.write(`support-mcp audit write failed: ${(err as Error).message}\n`);
    }
  }
}
