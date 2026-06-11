import { loadConfig } from "../../support-mcpd/src/config.js";
import { createAuditAdminServer } from "./server.js";

const config = loadConfig();
const server = createAuditAdminServer(config);

server.listen(config.audit_admin.port, config.audit_admin.host, () => {
  process.stderr.write(
    `support-mcp audit admin listening on http://${config.audit_admin.host}:${config.audit_admin.port}\n`
  );
});
