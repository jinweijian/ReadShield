# Operation Runbook

1. 创建 support-mcp 低权限用户。
2. 使用 ACL、只读挂载或影子目录保证日志只读可见。
3. 为 MySQL 创建只读账号，只授予必要 schema/table 的 SELECT 权限。
4. 复制 `config/config.example.yaml` 到 `config/config.yaml`，配置 `hosts`、`targets`、`services`、`databases`。
5. 用环境变量提供数据库凭据，不把密码写入配置文件：
   - `SUPPORT_MCP_DB_<NAME>_DSN`
   - `SUPPORT_MCP_DOCKER_MYSQL_USER`
   - `SUPPORT_MCP_DOCKER_MYSQL_PASSWORD`
6. 构建并启动 MCP：
   - `npm install`
   - `npm start`
7. 启动审计后台：
   - `npm run audit`
   - 默认访问 `http://127.0.0.1:18080`
8. 在 Codex / Claude Code 中注册 stdio MCP：
   - `codex mcp add readshield -- npm --prefix /path/to/support-mcp start`
   - `claude mcp add readshield -- npm --prefix /path/to/support-mcp start`
