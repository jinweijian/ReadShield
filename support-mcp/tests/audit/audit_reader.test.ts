import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readAuditEntries } from "../../cmd/audit-admin/src/audit_reader.js";

test("reads newest audit entries first and skips malformed lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "support-mcp-audit-"));
  const file = path.join(dir, "audit.log");
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ id: "1", at: "2026-01-01T00:00:00.000Z", tool: "logs.tail" }),
      "not-json",
      JSON.stringify({ id: "2", at: "2026-01-01T00:00:01.000Z", tool: "db.query" })
    ].join("\n"),
    "utf8"
  );

  const entries = readAuditEntries(file, 10);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, "2");
  assert.equal(entries[1].id, "1");
});

test("returns empty list when audit file does not exist", () => {
  const entries = readAuditEntries("/tmp/support-mcp-missing-audit-file.log", 10);

  assert.deepEqual(entries, []);
});
