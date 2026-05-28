# Threat Model (MVP)

- 默认拒绝所有工具，仅白名单放行。
- 不暴露 shell / sudo / 通用命令执行。
- target 与 service 都是枚举。
- 所有查询输出做脱敏与大小截断。
- 全部调用写入 JSONL 审计日志。
