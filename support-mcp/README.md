# ReadShield support-mcp

ReadShield 是本地只读 MCP 中间件，用来把 Agent 与跳板机、业务服务器、数据库和日志文件隔离开。Agent 只能调用 ReadShield 暴露的 MCP 工具，不能拿到 SSH、任意 shell、任意文件路径或数据库连接串。

## 能力

- 标准 stdio MCP Server，使用 `@modelcontextprotocol/sdk`。
- 日志读取：`logs.tail`、`logs.search`，仅允许配置中的 target，支持本机文件、SSH 远端文件和 Docker 容器日志。
- 服务状态：`service.status`，仅允许配置中的 service。
- 数据库只读查询：`db.query`、`db.explain`，支持普通 MySQL DSN、MySQL CLI 和 Docker 内 MySQL，也可以绑定 SSH host。
- 安全策略：默认拒绝、固定工具白名单、固定命令白名单、SQL 只读守卫、输出大小限制、敏感信息脱敏。
- 审计：每次工具调用写入 JSONL 审计日志，并可用本地审计后台查看。

## 快速开始

```bash
cd support-mcp
cp config/config.example.yaml config/config.yaml
npm install
npm run build
```

配置只读数据库账号：

```bash
export SUPPORT_MCP_DB_EDU_PROD_DSN='mysql://support_ro:***@127.0.0.1:3306/edu'
export SUPPORT_MCP_DOCKER_MYSQL_USER='support_ro'
export SUPPORT_MCP_DOCKER_MYSQL_PASSWORD='***'
```

启动 MCP：

```bash
npm start
```

启动审计后台：

```bash
npm run audit
```

默认访问地址：

```text
http://127.0.0.1:18080
```

## MCP 工具

- `logs.tail`
  - 参数：`target`、`lines`
  - 读取配置 target 的最后 N 行。
- `logs.search`
  - 参数：`target`、`keyword`、`matches`
  - 使用固定字符串搜索，不启用正则。
- `service.status`
  - 参数：`service`
  - 读取配置 service 的 systemd active 状态。
- `db.query`
  - 参数：`datasource`、`sql`
  - 只允许 `SELECT`、`SHOW`、`DESCRIBE`，自动追加 LIMIT。
- `db.explain`
  - 参数：`datasource`、`sql`
  - 对只读 SQL 执行 EXPLAIN。

## 安全边界

- 不暴露任意 shell 执行。
- 不接收任意文件路径，日志只能通过 `targets` 枚举访问。
- 不接收任意服务名，服务只能通过 `services` 枚举访问。
- 不接收任意 SSH 地址，远端服务器只能通过 `hosts` 枚举访问。
- 不接收数据库连接串，数据库只能通过 `databases` 枚举和环境变量访问。
- 子进程统一 `shell: false`，命令路径来自 `commands` 白名单。
- SSH 远端命令只由 ReadShield 根据配置生成，动态值统一 shell quote。
- Docker 日志只允许固定 `docker logs --tail <N> <container>`，容器名来自配置。
- Docker MySQL 只允许固定 `docker exec <container> mysql ... -e <readonly sql>`，容器名和 mysql 客户端来自配置。
- SQL 拒绝多语句、写关键字、敏感表和越权 schema。
- 输出先脱敏再裁剪，私钥、密码、token、手机号、身份证等不会原样返回。
- 审计日志只保存参数摘要和脱敏后的返回预览，不保存数据库连接串。

## MCP 客户端示例

Codex / Claude Code 可把 `npm start` 注册为 stdio MCP 命令：

```bash
codex mcp add readshield -- npm --prefix /path/to/ReadShield/support-mcp start
claude mcp add readshield -- npm --prefix /path/to/ReadShield/support-mcp start
```

如需使用非默认配置：

```bash
SUPPORT_MCP_CONFIG=/path/to/config.yaml npm start
```
