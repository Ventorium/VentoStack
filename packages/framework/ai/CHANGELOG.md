# @ventostack/ai

## Unreleased

### Security Fixes

- **工具默认拒绝**：Agent 未配置工具白名单时不再暴露注册表全部工具；请求体 `tools` 过滤器只能收窄白名单，不能扩权。`agentId` 无效时以 `AGENT_NOT_FOUND` 终止，不再降级为通用助手。
- **文件工具租户隔离**：`file-read` / `file-write` 的可访问范围从全局 `storagePath` 收窄为 `<storagePath>/tenants/<tenantId>/`。
- **sql-query 租户列防护**：拒绝把表达式别名为 `tenant_id` 输出列的查询（防止外层租户过滤被派生表遮蔽恒真导致跨租户读取）。
- **terminal 白名单强化**：禁用全部 shell 结构字符（管道/分号/重定向/命令替换），参数级白名单校验，`find -delete/-exec` 等写副作用旗标显式拒绝。
- **审批闭环修复**：待审批有效期调整为 24 小时；批准后从批准时刻起算 10 分钟使用窗口；过期请求不可批准/拒绝（原子 UPDATE）；新增机会性过期清理。
- **web-fetch 内网防护**：默认拒绝 localhost/私网 IPv4/IPv6/链路本地（含云元数据地址）目标 URL；支持 `readerBaseUrl` 指向自建 Reader。
- **输出防护全覆盖**：工具输出安全检查从 `fs-*`/`kb-*` 扩展到全部工具结果（覆盖 web/MCP 等外部不可信内容）。
- **研究子任务接入审批管线**：深度研究并行子任务与主循环共用参数校验/钩子/审批授权管线，不再绕过审批。
- **审计脱敏**：`ai_tool_log` 的 input/output 写入前经 `sanitize()` 递归脱敏。
- **成本硬封顶**：迭代数（50）/单轮 Token（100000）/研究子任务（10 个 × 8 轮）硬上限；对话端点按「租户+用户」限流（30 次/分钟）。
- **记忆增量持久化**：用户消息先行落盘，assistant（含工具调用摘要）与工具结果逐轮持久化，中断不再丢失整轮对话。
- **workspace 权限收紧**：Agent 工作区文件读取从 `ai:agent:list` 改为独立的 `ai:agent:workspace` 权限。

## 0.1.1

### Patch Changes

- [#1](https://github.com/Ventorium/VentoStack/pull/1) [`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35) Thanks [@erguotou520](https://github.com/erguotou520)! - Prepare every framework and platform package for compiled npm distribution, document each
  package, and add secure database-backed AI provider and model resolution.
- Updated dependencies [[`0b99c01`](https://github.com/Ventorium/VentoStack/commit/0b99c017d9b2c5c8a8090f677c26e89e66430d35)]:
  - @ventostack/auth@0.1.1
  - @ventostack/cache@0.1.1
  - @ventostack/core@0.1.1
  - @ventostack/database@0.1.1
  - @ventostack/events@0.1.1
  - @ventostack/file2md@0.1.1
  - @ventostack/notification@0.1.1
