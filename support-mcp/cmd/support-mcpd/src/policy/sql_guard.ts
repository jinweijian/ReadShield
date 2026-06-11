import sqlParser from "node-sql-parser";

const { Parser } = sqlParser as unknown as {
  Parser: new () => { astify(sql: string, options: { database: "MySQL" }): unknown };
};

const parser = new Parser();

const ALLOWED_SHOW_KEYWORDS = new Set(["tables", "databases", "columns"]);
const ALLOWED_AGGREGATES = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX"]);
const ALLOWED_BINARY_OPERATORS = new Set([
  "=",
  "!=",
  "<>",
  ">",
  ">=",
  "<",
  "<=",
  "AND",
  "OR",
  "LIKE",
  "NOT LIKE",
  "IN",
  "NOT IN",
  "BETWEEN",
  "IS",
  "IS NOT"
]);

export type SqlGuardOptions = {
  allowedSchemas?: string[];
  forbiddenTables?: string[];
};

function normalizeSql(sql: string): string {
  return sql.trim();
}

function reject(reason: string): never {
  throw new Error(`sql not allowlisted: ${reason}`);
}

function ensureIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_$-]+$/.test(value)) {
    reject(`invalid ${label}`);
  }
}

function hasComments(sql: string) {
  return /--|\/\*|\*\//.test(sql);
}

function parseSql(sql: string) {
  try {
    const ast = parser.astify(sql, { database: "MySQL" });
    if (Array.isArray(ast)) reject("multi statement sql is forbidden");
    return ast as Record<string, any>;
  } catch (err) {
    if ((err as Error).message.startsWith("sql not allowlisted")) throw err;
    reject("parse failed");
  }
}

function statementName(ast: Record<string, any>) {
  if (ast.type === "desc") return "describe";
  return String(ast.type ?? "").toLowerCase();
}

function validateTableRef(ref: Record<string, any>, options: SqlGuardOptions) {
  if (!ref || typeof ref !== "object") reject("invalid table reference");
  if ("expr" in ref) reject("table expressions are not allowlisted");
  if (ref.join && !["INNER JOIN", "LEFT JOIN", "RIGHT JOIN"].includes(String(ref.join).toUpperCase())) {
    reject(`join type is not allowlisted: ${ref.join}`);
  }

  ensureIdentifier(ref.table, "table name");
  if (ref.db != null) ensureIdentifier(ref.db, "schema name");
  if (ref.as != null) ensureIdentifier(ref.as, "table alias");

  const allowedSchemas = new Set((options.allowedSchemas ?? []).map((schema) => schema.toLowerCase()));
  const forbiddenTables = new Set((options.forbiddenTables ?? []).map((table) => table.toLowerCase()));

  if (ref.db && allowedSchemas.size > 0 && !allowedSchemas.has(String(ref.db).toLowerCase())) {
    throw new Error(`schema not allowed: ${ref.db}`);
  }
  if (forbiddenTables.has(String(ref.table).toLowerCase())) {
    throw new Error(`forbidden table: ${ref.table}`);
  }

  if (ref.on) validateExpression(ref.on);
}

function validateColumnAlias(alias: unknown) {
  if (alias != null) ensureIdentifier(alias, "column alias");
}

function validateExpression(expr: any): void {
  if (!expr || typeof expr !== "object") reject("invalid expression");

  switch (expr.type) {
    case "star":
      return;
    case "column_ref":
      if (expr.table != null) ensureIdentifier(expr.table, "column table qualifier");
      if (expr.column !== "*") ensureIdentifier(expr.column, "column name");
      return;
    case "number":
    case "single_quote_string":
    case "double_quote_string":
    case "bool":
    case "null":
      return;
    case "expr_list":
      if (!Array.isArray(expr.value)) reject("invalid expression list");
      expr.value.forEach(validateExpression);
      return;
    case "binary_expr": {
      const operator = String(expr.operator ?? "").toUpperCase();
      if (!ALLOWED_BINARY_OPERATORS.has(operator)) reject(`operator is not allowlisted: ${operator}`);
      validateExpression(expr.left);
      validateExpression(expr.right);
      return;
    }
    case "aggr_func": {
      const name = String(expr.name ?? "").toUpperCase();
      if (!ALLOWED_AGGREGATES.has(name)) reject(`aggregate is not allowlisted: ${name}`);
      validateExpression(expr.args?.expr ?? expr.args);
      if (expr.over) reject("window aggregate is not allowlisted");
      return;
    }
    default:
      reject(`expression type is not allowlisted: ${expr.type}`);
  }
}

function validateLimit(limit: any) {
  if (!limit) return;
  if (!Array.isArray(limit.value) || limit.value.length > 2) reject("invalid limit");
  for (const item of limit.value) {
    if (item?.type !== "number" || !Number.isInteger(Number(item.value)) || Number(item.value) < 0) {
      reject("limit must be a non-negative integer");
    }
  }
}

function validateSelect(ast: Record<string, any>, options: SqlGuardOptions) {
  if (ast.with) reject("with clause is not allowlisted");
  if (ast._next || ast.set_op) reject("set operations are not allowlisted");
  if (ast.options) reject("select options are not allowlisted");
  if (ast.into?.position) reject("select into is not allowlisted");
  if (ast.locking_read) reject("locking reads are not allowlisted");
  if (ast.window) reject("window clauses are not allowlisted");
  if (ast.collate) reject("collation clauses are not allowlisted");
  if (ast.distinct && ast.distinct !== "DISTINCT") reject("distinct option is not allowlisted");

  if (!Array.isArray(ast.from) || ast.from.length === 0) {
    reject("select must read from an allowlisted table reference");
  }
  ast.from.forEach((ref: Record<string, any>) => validateTableRef(ref, options));

  if (!Array.isArray(ast.columns) || ast.columns.length === 0) reject("select columns are required");
  for (const column of ast.columns) {
    validateExpression(column.expr);
    validateColumnAlias(column.as);
  }

  if (ast.where) validateExpression(ast.where);
  if (ast.groupby) {
    if (!Array.isArray(ast.groupby.columns)) reject("invalid group by");
    ast.groupby.columns.forEach(validateExpression);
  }
  if (ast.having) reject("having clause is not allowlisted");
  if (ast.orderby) {
    if (!Array.isArray(ast.orderby)) reject("invalid order by");
    for (const item of ast.orderby) {
      validateExpression(item.expr);
      if (item.type && !["ASC", "DESC"].includes(String(item.type).toUpperCase())) {
        reject(`order direction is not allowlisted: ${item.type}`);
      }
    }
  }
  validateLimit(ast.limit);
}

function validateShow(ast: Record<string, any>, options: SqlGuardOptions) {
  const keyword = String(ast.keyword ?? "").toLowerCase();
  if (!ALLOWED_SHOW_KEYWORDS.has(keyword)) reject(`show keyword is not allowlisted: ${keyword}`);
  if (ast.from) {
    if (!Array.isArray(ast.from) || ast.from.length !== 1) reject("invalid show table reference");
    validateTableRef(ast.from[0], options);
  }
}

function validateDescribe(ast: Record<string, any>, options: SqlGuardOptions) {
  validateTableRef({ table: ast.table }, options);
}

function validateExplain(ast: Record<string, any>, options: SqlGuardOptions) {
  if (!ast.expr || typeof ast.expr !== "object") reject("invalid explain expression");
  if (statementName(ast.expr) !== "select") reject("only explain select is allowlisted");
  validateSelect(ast.expr, options);
}

export class SqlGuard {
  assertReadonlySql(
    sql: string,
    allowedStatements: string[] = ["select", "show", "describe", "explain"],
    options: SqlGuardOptions = {}
  ) {
    const normalized = normalizeSql(sql);
    if (!normalized) throw new Error("sql is empty");
    if (normalized.includes(";")) reject("multi statement sql is forbidden");
    if (hasComments(normalized)) reject("comments are not allowlisted");

    const ast = parseSql(normalized);
    const statement = statementName(ast);
    const allowed = new Set(allowedStatements.map((item) => (item === "desc" ? "describe" : item).toLowerCase()));
    if (!allowed.has(statement)) {
      throw new Error(`sql type forbidden: ${statement}`);
    }

    if (statement === "select") validateSelect(ast, options);
    else if (statement === "show") validateShow(ast, options);
    else if (statement === "describe") validateDescribe(ast, options);
    else if (statement === "explain") validateExplain(ast, options);
    else reject(`statement type is not allowlisted: ${statement}`);
  }

  enforceLimit(sql: string, maxRows: number): string {
    const trimmed = sql.trim();
    const lower = trimmed.toLowerCase();
    if (/\blimit\s+\d+/i.test(trimmed)) {
      return trimmed;
    }
    if (lower.startsWith("show") || lower.startsWith("describe") || lower.startsWith("desc") || lower.startsWith("explain")) {
      return trimmed;
    }
    return `${trimmed} LIMIT ${maxRows}`;
  }
}
