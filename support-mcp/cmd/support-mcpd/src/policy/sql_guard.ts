const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "replace",
  "alter",
  "drop",
  "create",
  "truncate",
  "call",
  "load",
  "set",
  "kill",
  "lock",
  "unlock",
  "grant",
  "revoke",
  "outfile",
  "dumpfile",
  "load_file"
];

export type SqlGuardOptions = {
  allowedSchemas?: string[];
  forbiddenTables?: string[];
};

function normalizeSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

function stripIdentifierQuotes(identifier: string): string {
  return identifier.replace(/^[`"']|[`"']$/g, "");
}

function splitTableRef(ref: string) {
  const cleaned = ref.split(/\s+/)[0].replace(/[;,)]$/, "");
  const parts = cleaned.split(".").map(stripIdentifierQuotes).filter(Boolean);
  if (parts.length >= 2) {
    return { schema: parts[parts.length - 2], table: parts[parts.length - 1] };
  }
  return { schema: undefined, table: parts[0] };
}

function referencedTables(sql: string) {
  const refs: Array<{ schema?: string; table: string }> = [];
  const patterns = [
    /\bfrom\s+([`"']?[a-zA-Z0-9_$-]+[`"']?(?:\.[`"']?[a-zA-Z0-9_$-]+[`"']?)?)/gi,
    /\bjoin\s+([`"']?[a-zA-Z0-9_$-]+[`"']?(?:\.[`"']?[a-zA-Z0-9_$-]+[`"']?)?)/gi,
    /\bdescribe\s+([`"']?[a-zA-Z0-9_$-]+[`"']?(?:\.[`"']?[a-zA-Z0-9_$-]+[`"']?)?)/gi,
    /\bshow\s+columns\s+from\s+([`"']?[a-zA-Z0-9_$-]+[`"']?(?:\.[`"']?[a-zA-Z0-9_$-]+[`"']?)?)/gi
  ];

  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) {
      const tableRef = splitTableRef(match[1]);
      if (tableRef.table) refs.push(tableRef as { schema?: string; table: string });
    }
  }
  return refs;
}

export class SqlGuard {
  assertReadonlySql(
    sql: string,
    allowedStatements: string[] = ["select", "show", "describe", "explain"],
    options: SqlGuardOptions = {}
  ) {
    const normalized = normalizeSql(sql);
    if (!normalized) throw new Error("sql is empty");

    if (normalized.includes(";")) {
      throw new Error("multi statement sql is forbidden");
    }

    const lower = normalized.toLowerCase();
    const firstToken = lower.split(/\s+/)[0];
    if (!allowedStatements.includes(firstToken)) {
      throw new Error(`sql type forbidden: ${firstToken}`);
    }

    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (new RegExp(`\\b${keyword}\\b`, "i").test(normalized)) {
        throw new Error(`sql contains forbidden keyword: ${keyword}`);
      }
    }

    const allowedSchemas = new Set((options.allowedSchemas ?? []).map((s) => s.toLowerCase()));
    const forbiddenTables = new Set((options.forbiddenTables ?? []).map((t) => t.toLowerCase()));

    for (const ref of referencedTables(normalized)) {
      if (ref.schema && allowedSchemas.size > 0 && !allowedSchemas.has(ref.schema.toLowerCase())) {
        throw new Error(`schema not allowed: ${ref.schema}`);
      }
      if (forbiddenTables.has(ref.table.toLowerCase())) {
        throw new Error(`forbidden table: ${ref.table}`);
      }
    }
  }

  enforceLimit(sql: string, maxRows: number): string {
    const trimmed = sql.trim();
    const lower = trimmed.toLowerCase();
    if (/\blimit\s+\d+/i.test(trimmed)) {
      return trimmed;
    }
    if (lower.startsWith("show") || lower.startsWith("describe") || lower.startsWith("explain")) {
      return trimmed;
    }
    return `${trimmed} LIMIT ${maxRows}`;
  }
}
