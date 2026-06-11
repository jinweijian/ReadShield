import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { ToolHandlers } from "./tools.js";

export function createMcpServer(config: AppConfig) {
  const handlers = new ToolHandlers(config);
  const server = new McpServer({
    name: "readshield",
    version: "0.2.0"
  });

  server.registerTool(
    "logs.tail",
    {
      title: "Tail log",
      description: "Read the last N lines from a configured log target.",
      inputSchema: {
        target: z.string().describe("Configured target name, for example nginx_access or app_prod."),
        lines: z.number().int().positive().optional().describe("Line count, capped by server config.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    (args) => handlers.call("logs.tail", args)
  );

  server.registerTool(
    "logs.search",
    {
      title: "Search log",
      description: "Search a configured log target with fixed-string matching.",
      inputSchema: {
        target: z.string().describe("Configured target name, for example nginx_error or app_prod."),
        keyword: z.string().min(1).describe("Fixed string keyword. Regex is not enabled."),
        matches: z.number().int().positive().optional().describe("Maximum matches, capped by server config.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    (args) => handlers.call("logs.search", args)
  );

  server.registerTool(
    "service.status",
    {
      title: "Service status",
      description: "Read systemd active status for a configured service.",
      inputSchema: {
        service: z.string().describe("Configured service name.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    (args) => handlers.call("service.status", args)
  );

  server.registerTool(
    "db.query",
    {
      title: "Read database",
      description: "Run a readonly SQL query against a configured datasource.",
      inputSchema: {
        datasource: z.string().describe("Configured datasource name."),
        sql: z.string().min(1).describe("Readonly SELECT, SHOW, or DESCRIBE SQL.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false }
    },
    (args) => handlers.call("db.query", args)
  );

  server.registerTool(
    "db.explain",
    {
      title: "Explain database query",
      description: "Run EXPLAIN for a readonly SQL query against a configured datasource.",
      inputSchema: {
        datasource: z.string().describe("Configured datasource name."),
        sql: z.string().min(1).describe("Readonly SELECT, SHOW, DESCRIBE, or EXPLAIN SQL.")
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    (args) => handlers.call("db.explain", args)
  );

  return {
    async start() {
      process.stderr.write("readshield support-mcpd started (stdio)\n");
      await server.connect(new StdioServerTransport());
    }
  };
}
