# Operation Runbook

1. 创建 support-mcp 低权限用户。
2. 使用 ACL 或影子目录保证日志只读可见。
3. 配置 config/config.yaml 中 targets/services。
4. 本地运行 scripts/support-mcp-login-and-run.sh。
5. 在 Codex / Claude Code 中注册 stdio MCP：
   - `codex mcp add support-mcp -- /path/to/support-mcp/scripts/support-mcp-login-and-run.sh`
   - `claude mcp add support-mcp -- /path/to/support-mcp/scripts/support-mcp-login-and-run.sh`
