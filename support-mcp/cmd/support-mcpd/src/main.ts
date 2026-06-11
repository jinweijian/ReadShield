import { loadConfig } from "./config.js";
import { createMcpServer } from "./mcp/server.js";

const config = loadConfig();
await createMcpServer(config).start();
