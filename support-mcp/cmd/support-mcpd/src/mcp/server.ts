import { ToolHandlers } from "./tools.js";

export function createMcpServer(config: any) {
  const handlers = new ToolHandlers(config);

  return {
    start() {
      process.stderr.write("support-mcpd started (stdio)\n");
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", async (chunk) => {
        try {
          const req = JSON.parse(chunk.toString());
          if (req?.method === "tools/list") {
            process.stdout.write(JSON.stringify({
              id: req.id,
              result: handlers.listTools()
            }) + "\n");
            return;
          }
          if (req?.method === "tools/call") {
            const result = await handlers.call(req.params?.name, req.params?.arguments ?? {});
            process.stdout.write(JSON.stringify({ id: req.id, result }) + "\n");
            return;
          }
          process.stdout.write(JSON.stringify({ id: req.id, error: { message: "unsupported method" } }) + "\n");
        } catch (err: any) {
          process.stdout.write(JSON.stringify({ error: { message: err.message } }) + "\n");
        }
      });
    }
  };
}
