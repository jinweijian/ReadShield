import { createPool, Pool } from "mysql2/promise";
import type { DockerMysqlDatabaseConfig } from "../config.js";
import { CommandRunner } from "./command_runner.js";

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export class DbReader {
  private pools = new Map<string, Pool>();

  constructor(private commandRunner: CommandRunner) {}

  private getPool(dsn: string): Pool {
    if (!this.pools.has(dsn)) {
      this.pools.set(
        dsn,
        createPool({
          uri: dsn,
          connectionLimit: 2,
          waitForConnections: true
        })
      );
    }
    return this.pools.get(dsn)!;
  }

  async queryDsn(dsn: string, sql: string, timeoutSec: number): Promise<QueryResult> {
    const pool = this.getPool(dsn);
    const [rows, fields] = await pool.query({ sql, timeout: timeoutSec * 1000 });
    const columns = Array.isArray(fields) ? fields.map((field: any) => String(field.name)) : [];
    return { columns, rows: Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [] };
  }

  async queryDockerMysql(
    dockerBin: string,
    datasource: DockerMysqlDatabaseConfig,
    sql: string,
    timeoutSec: number
  ): Promise<QueryResult> {
    const user = process.env[datasource.user_env];
    if (!user) throw new Error(`missing docker mysql user env: ${datasource.user_env}`);
    const password = datasource.password_env ? process.env[datasource.password_env] : undefined;

    const envArgs = password ? ["-e", `MYSQL_PWD=${password}`] : [];
    const databaseArgs = datasource.database ? [datasource.database] : [];
    const args = [
      "exec",
      ...envArgs,
      datasource.container,
      datasource.mysql_bin,
      "--batch",
      "--raw",
      "--default-character-set=utf8mb4",
      "-u",
      user,
      ...databaseArgs,
      "-e",
      sql
    ];

    const output = await this.commandRunner.run(dockerBin, args, {
      maxOutputBytes: 1024 * 1024,
      allowExitCodes: [0]
    });
    return parseMysqlBatchOutput(output);
  }
}

export function parseMysqlBatchOutput(output: string): QueryResult {
  const lines = output.trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = parseMysqlBatchLine(lines[0]).map(String);
  const rows = lines.slice(1).map((line) => {
    const values = parseMysqlBatchLine(line);
    const row: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? null;
    });
    return row;
  });

  return { columns, rows };
}

function parseMysqlBatchLine(line: string) {
  return line.split("\t").map((value) => {
    if (value === "NULL") return null;
    return value.replace(/\\t/g, "\t").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  });
}
