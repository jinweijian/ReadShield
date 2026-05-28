import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { createMcpServer } from "./mcp/server.js";

const ConfigSchema = z.object({
  server: z.object({
    transport: z.literal("stdio"),
    profile: z.string(),
    audit_log: z.string()
  }),
  security: z.object({
    max_response_bytes: z.number()
  }),
  limits: z.object({
    command_timeout_sec: z.number(),
    logs_tail_max_lines: z.number(),
    logs_search_max_matches: z.number()
  }),
  targets: z.record(z.object({ path: z.string(), allowed_tools: z.array(z.string()) })),
  services: z.record(z.object({ unit: z.string() }))
});

function loadConfig(configPath: string) {
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = yaml.load(raw);
  return ConfigSchema.parse(parsed);
}

const configPath = process.env.SUPPORT_MCP_CONFIG ?? path.resolve("config/config.yaml");
const config = loadConfig(configPath);
createMcpServer(config).start();
