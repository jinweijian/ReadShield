# Threat Model (MVP)

- 默认拒绝所有工具，仅白名单放行。
- 不暴露 shell / sudo / 通用命令执行。
- host、target、service、datasource 都是配置枚举，Agent 不能传 SSH 地址、文件路径、容器名或连接串。
- 本地子进程统一 `shell: false`；SSH 远端命令由 ReadShield 根据配置生成，动态参数统一 quote。
- 日志读取只允许 file tail/search 与 docker logs tail/search。
- 数据库 SQL 解析为 AST 后只允许明确支持的只读子集，并拒绝多语句、注释、非白名单函数/表达式、敏感表与越权 schema。
- Docker MySQL 只允许固定 `docker exec <container> mysql ... -e <readonly sql>`。
- 所有查询输出做脱敏与大小截断。
- 全部调用写入 JSONL 审计日志；审计只保存参数摘要和脱敏返回预览。
- 审计后台只读审计文件，不提供删除或修改接口。
