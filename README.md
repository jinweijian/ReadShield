# ReadShield

ReadShield 是一个面向 Agent 的只读数据访问隔离层。它的目标不是让 Agent 直接进入服务器，而是在 Agent 和生产/测试服务器之间放置一个受控的 MCP 中间件，只返回被允许读取、已经脱敏、可审计的数据。

## 核心理念

### 1. Agent 不直接接触基础设施

Agent 不应该拿到 SSH 连接、数据库连接串、任意 shell、任意文件路径或容器访问权限。ReadShield 作为中间层保存这些能力，并把它们收敛成少量只读 MCP 工具。

Agent 看到的是：

- `logs.tail`
- `logs.search`
- `service.status`
- `db.query`
- `db.explain`

Agent 看不到的是：

- SSH 私钥或 SSH 地址的自由输入能力
- 任意命令执行能力
- 任意文件路径读取能力
- 数据库账号密码
- Docker 任意操作能力

### 2. 默认拒绝，枚举放行

ReadShield 的所有访问对象都必须先写入配置白名单：

- `hosts`：允许访问的服务器
- `targets`：允许读取的日志目标
- `services`：允许查看状态的服务
- `databases`：允许查询的数据源
- `commands`：允许由 ReadShield 内部调用的命令路径

Agent 请求时只能引用这些枚举名，不能临时传入新的服务器、路径、容器名或连接串。

### 3. 只读是安全边界，不是提示词约定

ReadShield 不依赖“请 Agent 不要写数据”这种软约束，而是在代码层限制能力：

- 子进程统一使用 `shell: false`
- 日志只允许 tail/search
- Docker 日志只允许固定 `docker logs --tail`
- Docker MySQL 只允许固定 `docker exec <container> mysql ... -e <readonly sql>`
- SQL 解析为 AST 后只允许明确支持的只读子集：`SELECT ... FROM ...`、`SHOW TABLES/DATABASES/COLUMNS`、`DESCRIBE`、`EXPLAIN SELECT`
- SQL 拒绝多语句、注释、非白名单函数/表达式、敏感表和越权 schema

### 4. 返回给 Agent 的数据必须先脱敏

ReadShield 返回数据前会统一做敏感信息过滤。私钥、密码、token、手机号、身份证等内容不允许原样出现在 MCP 返回值或审计预览中。

这条原则同样适用于：

- Nginx 日志
- 代码运行日志
- Docker 容器日志
- MySQL 查询结果
- 工具错误信息
- 审计后台展示内容

### 5. 所有访问都可审计

每一次 MCP 工具调用都会写入 JSONL 审计日志，记录：

- 调用时间
- 工具名
- 参数摘要
- 执行状态
- 耗时
- 返回大小
- 脱敏后的返回预览或错误信息

审计后台只读展示这些记录，不提供删除或修改接口。

## 当前结构

```text
ReadShield/
  README.md
  support-mcp/
    package.json
    config/
    cmd/
      support-mcpd/
      audit-admin/
    tests/
```

`ReadShield` 是项目根目录，用来表达整体产品和安全设计。

`support-mcp` 是当前第一个可运行模块，是一个 npm package，包含 MCP server、审计后台、配置示例和测试。所有可执行代码目前集中在这里，是为了让第一个交付单元边界清楚：它专注解决“技术支持/排障场景下，Agent 只读访问服务器数据”的问题。

未来如果需要扩展，可以在根目录下继续增加独立模块，例如：

- 管理后台前端
- 部署配置
- 多租户策略中心
- 权限审批服务
- 其他语言版本的 MCP server

## 当前能力

`support-mcp` 当前支持：

- 读取本机文件日志
- 读取 SSH 远端文件日志
- 读取 Docker 容器运行日志
- 查询普通 MySQL
- 查询 Docker 内 MySQL
- 查看 systemd 服务状态
- 对 MCP 返回结果做敏感信息脱敏
- 写入审计日志
- 通过本地审计后台查看调用记录

## 快速使用

```bash
cd support-mcp
cp config/config.example.yaml config/config.yaml
npm install
npm test
npm start
```

启动审计后台：

```bash
npm run audit
```

默认访问：

```text
http://127.0.0.1:18080
```

注册到 Codex：

```bash
codex mcp add readshield -- npm --prefix /path/to/ReadShield/support-mcp start
```

更多具体配置和工具说明见 [support-mcp/README.md](support-mcp/README.md)。

## 设计目标

ReadShield 的最终判断标准是：

Agent 能够完成排障所需的只读查询，但无法越过 ReadShield 直接操作服务器。

换句话说，ReadShield 要让 Agent “看得见必要数据”，但“碰不到基础设施”。
