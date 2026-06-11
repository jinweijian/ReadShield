import fs from "node:fs";

export function readAuditEntries(file: string, limit: number): Array<Record<string, unknown>> {
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/);
  const entries: Array<Record<string, unknown>> = [];
  for (let index = lines.length - 1; index >= 0 && entries.length < limit; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") entries.push(parsed);
    } catch {
      // Skip malformed audit lines so one bad append cannot hide later entries.
    }
  }
  return entries;
}
