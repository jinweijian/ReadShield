import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig, DatabaseConfig, TargetConfig } from "../config.js";
import { AuditLogger } from "../audit/audit_logger.js";
import { PolicyEngine, type AllowedToolName } from "../policy/whitelist.js";
import { SqlGuard } from "../policy/sql_guard.js";
import { Redactor } from "../redact/redact.js";
import { CommandRunner } from "../runner/command_runner.js";
import { DbReader, parseMysqlBatchOutput } from "../runner/db_reader.js";
import { shellQuote, SshRunner } from "../runner/ssh_runner.js";

type LogTailArgs = { target: string; lines?: number };
type LogSearchArgs = { target: string; keyword: string; matches?: number };
type ServiceStatusArgs = { service: string };
type DbQueryArgs = { datasource: string; sql: string };

type ToolArgs = LogTailArgs | LogSearchArgs | ServiceStatusArgs | DbQueryArgs;

export class ToolHandlers {
  private policy: PolicyEngine;
  private sqlGuard: SqlGuard;
  private runner: CommandRunner;
  private sshRunner?: SshRunner;
  private dbReader: DbReader;
  private redactor: Redactor;
  private audit: AuditLogger;

  constructor(private config: AppConfig) {
    this.policy = new PolicyEngine(config);
    this.sqlGuard = new SqlGuard();
    this.runner = new CommandRunner(config.limits.command_timeout_sec);
    this.sshRunner = config.commands.ssh?.bin ? new SshRunner(this.runner, config.commands.ssh.bin) : undefined;
    this.dbReader = new DbReader(this.runner);
    this.redactor = new Redactor();
    this.audit = new AuditLogger(config.server.audit_log);
  }

  async call(name: AllowedToolName, args: ToolArgs): Promise<CallToolResult> {
    const startedAt = Date.now();
    const auditId = this.audit.nextId();

    try {
      this.policy.assertAllowed(name);
      const result = await this.dispatch(name, args, auditId, startedAt);
      const sizeBytes = Buffer.byteLength(JSON.stringify(result.structuredContent ?? result.content), "utf8");
      this.audit.write({
        id: auditId,
        at: new Date().toISOString(),
        tool: name,
        status: "ok",
        args: this.auditSummary(args),
        elapsedMs: Date.now() - startedAt,
        sizeBytes,
        responsePreview: this.preview(result)
      });
      return result;
    } catch (err) {
      const message = this.redactor.apply((err as Error).message);
      this.audit.write({
        id: auditId,
        at: new Date().toISOString(),
        tool: name,
        status: "error",
        args: this.auditSummary(args),
        elapsedMs: Date.now() - startedAt,
        error: message
      });
      return {
        isError: true,
        content: [{ type: "text", text: message }],
        structuredContent: { auditId, error: message }
      };
    }
  }

  private async dispatch(
    name: AllowedToolName,
    args: ToolArgs,
    auditId: string,
    startedAt: number
  ): Promise<CallToolResult> {
    if (name === "logs.tail") return this.logsTail(args as LogTailArgs, auditId, startedAt);
    if (name === "logs.search") return this.logsSearch(args as LogSearchArgs, auditId, startedAt);
    if (name === "service.status") return this.serviceStatus(args as ServiceStatusArgs, auditId, startedAt);
    if (name === "db.query" || name === "db.explain") return this.dbQuery(name, args as DbQueryArgs, auditId, startedAt);
    throw new Error(`tool not allowed: ${name}`);
  }

  private async logsTail(args: LogTailArgs, auditId: string, startedAt: number): Promise<CallToolResult> {
    const target = this.policy.resolveTarget(args.target, "logs.tail");
    const lines = Math.min(Math.max(Number(args.lines ?? 200), 1), this.config.limits.logs_tail_max_lines);
    const raw = await this.readTargetTail(target, lines);
    const output = this.redactAndClipText(raw);
    return this.asToolResult(
      {
        auditId,
        target: args.target,
        targetType: target.type ?? "file",
        lines,
        content: output.text,
        truncated: output.truncated,
        elapsedMs: Date.now() - startedAt
      },
      output.text
    );
  }

  private async logsSearch(args: LogSearchArgs, auditId: string, startedAt: number): Promise<CallToolResult> {
    const target = this.policy.resolveTarget(args.target, "logs.search");
    const keyword = String(args.keyword ?? "").slice(0, 200);
    if (!keyword.trim()) throw new Error("keyword is required");
    const matches = Math.min(
      Math.max(Number(args.matches ?? this.config.limits.logs_search_max_matches), 1),
      this.config.limits.logs_search_max_matches
    );
    const raw = await this.readTargetSearch(target, keyword, matches);
    const output = this.redactAndClipText(raw);
    return this.asToolResult(
      {
        auditId,
        target: args.target,
        targetType: target.type ?? "file",
        keyword,
        matches,
        content: output.text,
        truncated: output.truncated,
        elapsedMs: Date.now() - startedAt
      },
      output.text
    );
  }

  private async serviceStatus(args: ServiceStatusArgs, auditId: string, startedAt: number): Promise<CallToolResult> {
    const service = this.policy.resolveService(args.service);
    const raw = service.host
      ? await this.runRemote(
          service.host,
          `${shellQuote(this.config.commands.systemctl.bin)} is-active ${shellQuote(service.unit)}`,
          4096
        )
      : await this.runner.run(this.config.commands.systemctl.bin, ["is-active", service.unit], {
          allowExitCodes: [0, 3],
          maxOutputBytes: 4096
        });
    const output = this.redactAndClipText(raw);
    return this.asToolResult(
      {
        auditId,
        service: args.service,
        unit: service.unit,
        status: output.text.trim() || "unknown",
        elapsedMs: Date.now() - startedAt
      },
      output.text
    );
  }

  private async dbQuery(
    name: "db.query" | "db.explain",
    args: DbQueryArgs,
    auditId: string,
    startedAt: number
  ): Promise<CallToolResult> {
    const datasourceName = String(args.datasource ?? "");
    const datasource = this.policy.resolveDatasource(datasourceName);
    let sql = String(args.sql ?? "").trim();
    this.sqlGuard.assertReadonlySql(
      sql,
      name === "db.explain" ? ["select", "show", "describe", "explain"] : ["select", "show", "describe"],
      {
        allowedSchemas: datasource.allowed_schemas,
        forbiddenTables: datasource.forbidden_tables
      }
    );

    if (name === "db.query") {
      sql = this.sqlGuard.enforceLimit(sql, Math.min(datasource.max_rows, this.config.limits.db_max_rows));
    } else if (!sql.toLowerCase().startsWith("explain")) {
      sql = `EXPLAIN ${sql}`;
    }

    const timeoutSec = Math.min(datasource.timeout_sec, this.config.limits.db_query_timeout_sec);
    const queryResult = await this.runDatabaseQuery(datasource, sql, timeoutSec);
    const redactedRows = this.redactor.applyToValue(queryResult.rows) as Record<string, unknown>[];
    const structuredContent = this.fitStructuredContent({
      auditId,
      datasource: datasourceName,
      datasourceType: datasource.type ?? "mysql",
      host: datasource.host,
      sqlType: sql.split(/\s+/)[0].toUpperCase(),
      columns: queryResult.columns,
      rows: redactedRows,
      rowCount: redactedRows.length,
      truncated: false,
      elapsedMs: Date.now() - startedAt,
      warnings: []
    });
    return this.asToolResult(structuredContent, JSON.stringify(structuredContent, null, 2));
  }

  private async readTargetTail(target: TargetConfig, lines: number) {
    if (target.type === "docker-logs") {
      return this.readDockerLogs(target.host, target.container, lines);
    }
    if (target.host) {
      return this.runRemote(
        target.host,
        `${shellQuote(this.config.commands.tail.bin)} -n ${lines} -- ${shellQuote(target.path)}`,
        this.config.security.max_response_bytes * 2
      );
    }
    return this.runner.run(this.config.commands.tail.bin, ["-n", String(lines), target.path], {
      maxOutputBytes: this.config.security.max_response_bytes * 2
    });
  }

  private async readTargetSearch(target: TargetConfig, keyword: string, matches: number) {
    if (target.type === "docker-logs") {
      const lines = Math.min(target.tail_lines ?? this.config.limits.logs_tail_max_lines, this.config.limits.logs_tail_max_lines);
      const output = await this.readDockerLogs(target.host, target.container, lines);
      return output
        .split(/\r?\n/)
        .filter((line) => line.includes(keyword))
        .slice(0, matches)
        .join("\n");
    }
    if (target.host) {
      return this.runRemote(
        target.host,
        `${shellQuote(this.config.commands.grep.bin)} -F -m ${matches} -- ${shellQuote(keyword)} ${shellQuote(target.path)} || test $? -eq 1`,
        this.config.security.max_response_bytes * 2
      );
    }
    return this.runner.run(this.config.commands.grep.bin, ["-F", "-m", String(matches), "--", keyword, target.path], {
      allowExitCodes: [0, 1],
      maxOutputBytes: this.config.security.max_response_bytes * 2
    });
  }

  private async readDockerLogs(hostName: string | undefined, container: string, lines: number) {
    const dockerBin = this.config.commands.docker?.bin;
    if (!dockerBin) throw new Error("docker command is not configured");
    if (hostName) {
      return this.runRemote(
        hostName,
        `${shellQuote(dockerBin)} logs --tail ${lines} ${shellQuote(container)}`,
        this.config.security.max_response_bytes * 2,
        true
      );
    }
    return this.runner.run(dockerBin, ["logs", "--tail", String(lines), container], {
      maxOutputBytes: this.config.security.max_response_bytes * 2,
      mergeStderr: true
    });
  }

  private async runDatabaseQuery(datasource: DatabaseConfig, sql: string, timeoutSec: number) {
    if (datasource.type === "docker-mysql") {
      if (datasource.host) {
        const dockerBin = datasource.docker_bin ?? this.config.commands.docker?.bin;
        if (!dockerBin) throw new Error("docker command is not configured");
        const output = await this.runRemote(
          datasource.host,
          this.buildDockerMysqlCommand(dockerBin, datasource, sql),
          this.config.security.max_response_bytes * 2
        );
        return parseMysqlBatchOutput(output);
      }

      const dockerBin = datasource.docker_bin ?? this.config.commands.docker?.bin;
      if (!dockerBin) throw new Error("docker command is not configured");
      return this.dbReader.queryDockerMysql(dockerBin, datasource, sql, timeoutSec);
    }

    if (datasource.type === "mysql-cli") {
      const command = this.buildMysqlCliCommand(datasource, sql);
      if (datasource.host) {
        const output = await this.runRemote(datasource.host, command, this.config.security.max_response_bytes * 2);
        return parseMysqlBatchOutput(output);
      }
      const output = await this.runner.run(datasource.mysql_bin, this.mysqlCliArgs(datasource, sql), {
        env: this.mysqlCliEnv(datasource),
        maxOutputBytes: this.config.security.max_response_bytes * 2
      });
      return parseMysqlBatchOutput(output);
    }

    if (!("dsn_env" in datasource)) throw new Error("datasource dsn env is not configured");
    const dsn = process.env[datasource.dsn_env];
    if (!dsn) throw new Error(`missing datasource dsn env: ${datasource.dsn_env}`);
    return this.dbReader.queryDsn(dsn, sql, timeoutSec);
  }

  private buildDockerMysqlCommand(dockerBin: string, datasource: Extract<DatabaseConfig, { type: "docker-mysql" }>, sql: string) {
    const mysql = [
      shellQuote(datasource.mysql_bin),
      "--batch",
      "--raw",
      "--default-character-set=utf8mb4",
      "-u",
      shellQuote(this.requiredEnv(datasource.user_env)),
      ...this.databaseShellArg(datasource.database),
      "-e",
      shellQuote(sql)
    ].join(" ");
    return `${shellQuote(dockerBin)} exec ${this.dockerEnvArgs(datasource).join(" ")} ${shellQuote(datasource.container)} ${mysql}`;
  }

  private buildMysqlCliCommand(datasource: Extract<DatabaseConfig, { type: "mysql-cli" }>, sql: string) {
    return [
      ...this.mysqlCliEnvPrefix(datasource),
      shellQuote(datasource.mysql_bin),
      "--batch",
      "--raw",
      "--default-character-set=utf8mb4",
      "-u",
      shellQuote(this.requiredEnv(datasource.user_env)),
      ...this.databaseShellArg(datasource.database),
      "-e",
      shellQuote(sql)
    ].join(" ");
  }

  private mysqlCliArgs(datasource: Extract<DatabaseConfig, { type: "mysql-cli" }>, sql: string) {
    return [
      "--batch",
      "--raw",
      "--default-character-set=utf8mb4",
      "-u",
      this.requiredEnv(datasource.user_env),
      ...this.databasePlainArg(datasource.database),
      "-e",
      sql
    ];
  }

  private mysqlCliEnv(datasource: { password_env?: string }) {
    return datasource.password_env ? { MYSQL_PWD: this.requiredEnv(datasource.password_env) } : undefined;
  }

  private mysqlCliEnvPrefix(datasource: { password_env?: string }) {
    return datasource.password_env ? [`MYSQL_PWD=${shellQuote(this.requiredEnv(datasource.password_env))}`] : [];
  }

  private dockerEnvArgs(datasource: { password_env?: string }) {
    return datasource.password_env ? ["-e", shellQuote(`MYSQL_PWD=${this.requiredEnv(datasource.password_env)}`)] : [];
  }

  private databaseShellArg(database?: string) {
    return database ? [shellQuote(database)] : [];
  }

  private databasePlainArg(database?: string) {
    return database ? [database] : [];
  }

  private requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`missing env: ${name}`);
    return value;
  }

  private async runRemote(hostName: string, remoteCommand: string, maxOutputBytes: number, mergeStderr = false) {
    if (!this.sshRunner) throw new Error("ssh command is not configured");
    return this.sshRunner.run(this.policy.resolveHost(hostName), remoteCommand, maxOutputBytes, mergeStderr);
  }

  private asToolResult(structuredContent: Record<string, unknown>, text: string): CallToolResult {
    const output = this.redactAndClipText(text);
    return {
      content: [{ type: "text", text: output.text }],
      structuredContent: this.redactor.applyToValue(structuredContent) as Record<string, unknown>
    };
  }

  private redactAndClipText(text: string) {
    const redacted = this.redactor.apply(text);
    const bytes = Buffer.from(redacted, "utf8");
    if (bytes.length <= this.config.security.max_response_bytes) {
      return { text: redacted, truncated: false };
    }
    return {
      text: bytes.subarray(0, this.config.security.max_response_bytes).toString("utf8"),
      truncated: true
    };
  }

  private fitStructuredContent<T extends { rows?: unknown[]; truncated?: boolean }>(content: T): T {
    const fitted = { ...content, rows: content.rows ? [...content.rows] : undefined } as T;
    while (
      fitted.rows &&
      fitted.rows.length > 0 &&
      Buffer.byteLength(JSON.stringify(fitted), "utf8") > this.config.security.max_response_bytes
    ) {
      fitted.rows.pop();
      fitted.truncated = true;
    }
    return fitted;
  }

  private auditSummary(args: unknown) {
    const redacted = this.redactor.applyToValue(args) as Record<string, unknown>;
    if (typeof redacted.sql === "string" && redacted.sql.length > 200) {
      redacted.sql = `${redacted.sql.slice(0, 200)}...`;
    }
    return redacted;
  }

  private preview(result: CallToolResult) {
    const text = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    return this.redactor.apply(text).slice(0, 2000);
  }
}
