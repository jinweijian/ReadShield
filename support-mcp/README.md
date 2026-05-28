# support-mcp

本地只读技术支持 MCP Server（MVP-1）。

## 目标
- 仅支持 `stdio` MCP。
- 仅支持只读查询能力（日志查询、服务状态）。
- 启动前强制登录校验。
- 默认拒绝，白名单放行。
- 全链路审计 + 输出脱敏。

## 快速开始
1. 复制配置：
   ```bash
   cp config/config.example.yaml config/config.yaml
   ```
2. 安装依赖并构建：
   ```bash
   npm install
   npm run build
   ```
3. 启动 wrapper（先登录再启动 mcpd）：
   ```bash
   ./scripts/support-mcp-login-and-run.sh
   ```

## 当前工具（MVP-1）
- `logs.tail`
- `logs.search`
- `service.status`

## 安全原则
- 不暴露任意 shell 执行。
- 不接收任意文件路径，只允许 `target` 枚举。
- 子进程统一 `shell: false` + 参数数组。
- 输出限制、脱敏、审计日志。
