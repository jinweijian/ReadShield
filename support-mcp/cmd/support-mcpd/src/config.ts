import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

const CommandSchema = z.object({
  bin: z.string().min(1)
});

const HostSchema = z.object({
  type: z.literal("ssh"),
  destination: z.string().min(1),
  options: z.array(z.string()).default(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"])
});

const TargetBaseSchema = z.object({
  host: z.string().optional(),
  allowed_tools: z.array(z.string()).default([])
});

const FileTargetSchema = TargetBaseSchema.extend({
  type: z.literal("file").optional(),
  path: z.string().min(1)
});

const DockerLogsTargetSchema = TargetBaseSchema.extend({
  type: z.literal("docker-logs"),
  container: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  tail_lines: z.number().int().positive().optional()
});

const DatabaseBaseSchema = z.object({
  host: z.string().optional(),
  readonly: z.boolean(),
  max_rows: z.number().int().positive(),
  timeout_sec: z.number().int().positive(),
  allowed_schemas: z.array(z.string()).optional(),
  forbidden_tables: z.array(z.string()).optional()
});

const MysqlDatabaseSchema = DatabaseBaseSchema.extend({
  type: z.literal("mysql").optional(),
  dsn_env: z.string().min(1)
});

const MysqlCliDatabaseSchema = DatabaseBaseSchema.extend({
  type: z.literal("mysql-cli"),
  mysql_bin: z.string().min(1).default("mysql"),
  user_env: z.string().min(1),
  password_env: z.string().min(1).optional(),
  database: z.string().regex(/^[a-zA-Z0-9_$.-]+$/).optional()
});

const DockerMysqlDatabaseSchema = DatabaseBaseSchema.extend({
  type: z.literal("docker-mysql"),
  container: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  docker_bin: z.string().min(1).optional(),
  mysql_bin: z.string().min(1).default("mysql"),
  user_env: z.string().min(1),
  password_env: z.string().min(1).optional(),
  database: z.string().regex(/^[a-zA-Z0-9_$.-]+$/).optional()
});

export const ConfigSchema = z.object({
  server: z.object({
    transport: z.literal("stdio"),
    profile: z.string(),
    audit_log: z.string()
  }),
  audit_admin: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().positive().default(18080),
    max_entries: z.number().int().positive().default(500)
  }),
  security: z.object({
    require_login: z.boolean().default(true),
    token_ttl_minutes: z.number().int().positive().default(480),
    deny_by_default: z.boolean().default(true),
    allow_shell: z.literal(false),
    allow_write_tools: z.literal(false),
    max_response_bytes: z.number().int().positive()
  }),
  limits: z.object({
    command_timeout_sec: z.number().int().positive(),
    logs_tail_max_lines: z.number().int().positive(),
    logs_search_max_matches: z.number().int().positive(),
    db_max_rows: z.number().int().positive(),
    db_query_timeout_sec: z.number().int().positive()
  }),
  commands: z.object({
    tail: CommandSchema,
    grep: CommandSchema,
    systemctl: CommandSchema,
    ssh: CommandSchema.optional(),
    docker: CommandSchema.optional()
  }),
  hosts: z.record(HostSchema).default({}),
  targets: z.record(z.union([FileTargetSchema, DockerLogsTargetSchema])),
  services: z.record(z.object({ host: z.string().optional(), unit: z.string().min(1) })),
  databases: z.record(z.union([MysqlDatabaseSchema, MysqlCliDatabaseSchema, DockerMysqlDatabaseSchema])).default({})
});

export type AppConfig = z.infer<typeof ConfigSchema>;
export type DatabaseConfig = AppConfig["databases"][string];
export type TargetConfig = AppConfig["targets"][string];
export type HostConfig = AppConfig["hosts"][string];
export type DockerMysqlDatabaseConfig = Extract<DatabaseConfig, { type: "docker-mysql" }>;
export type MysqlCliDatabaseConfig = Extract<DatabaseConfig, { type: "mysql-cli" }>;

export function loadConfig(configPath = process.env.SUPPORT_MCP_CONFIG ?? path.resolve("config/config.yaml")): AppConfig {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw);
  return ConfigSchema.parse(parsed);
}
