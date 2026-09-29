# @ventostack/ai

## 0.2.0

### Minor Changes

- [`45f6875`](https://github.com/Ventorium/VentoStack/commit/45f687501196a36234b323ad827a3afd2a480319) Thanks [@erguotou520](https://github.com/erguotou520)! - Add token-authenticated Vento Agent Runtime integration, persistent per-Agent sandbox lifecycle, sandbox-bound terminal and file tools, and platform configuration support.

### Patch Changes

- [`bf00f3f`](https://github.com/Ventorium/VentoStack/commit/bf00f3fab47373f8c7d95025bcc8552bc8e35744) Thanks [@erguotou520](https://github.com/erguotou520)! - file2md 的主解析改为委托 @ventostack/file-parser（Rust napi）：doc/docx/ppt/pptx/xls/xlsx/odt/ods/odp/rtf/epub/csv/pdf/html/图片(OCR) 全部由 Rust 完成，移除手写解析器与 @llamaindex/liteparse 依赖；本地仅保留 ZIP 解包与文本（markdown/代码/结构化/纯文本）兜底。OCR 服务重定义为 PaddleOCR 连接配置（`createRemoteOCRService` 支持 `token` 展开为 `Authorization: bearer` 头），ai 侧知识库上传新增 `ocr_token` 配置键贯通到解析。

- [`2d1aa08`](https://github.com/Ventorium/VentoStack/commit/2d1aa08485038145179fc6619ace9fefc77b6bda) Thanks [@erguotou520](https://github.com/erguotou520)! - fix: 安全加固与 RBAC 权限语义统一

  安全修复：

  - rate-limit 限流键优先取直接连接 IP，修复全局单桶可被 DoS 打挂
  - 认证 Cookie Secure 支持 COOKIE_SECURE 环境变量（生产默认 true）
  - OSS 上传增加扩展名/MIME 白名单与 magic bytes 校验，静态服务扩展名白名单
  - Webhook 入站增加时间戳窗口 + nonce 去重（防重放）
  - 日志脱敏改为包含匹配（覆盖 newPassword/oldPassword 变体）
  - handleError 不再泄露内部错误，新增 safeErrorMessage
  - 新增 TRUSTED_PROXIES 可信代理配置

  功能修复：

  - RBAC 权限调用统一为 perm("module:entity", "action")，种子权限同步
  - 用户角色分配 roleIds 落库（assignUserRoles）
  - workflow sequential 多审批人依次流转修复
  - 通知消息删除端点；分布式锁改为原子 SET NX EX
  - 批量操作数组上限、全局超时中间件（跳过 SSE）、CSV 公式注入防护

- Updated dependencies [[`bf00f3f`](https://github.com/Ventorium/VentoStack/commit/bf00f3fab47373f8c7d95025bcc8552bc8e35744), [`2d1aa08`](https://github.com/Ventorium/VentoStack/commit/2d1aa08485038145179fc6619ace9fefc77b6bda)]:
  - @ventostack/file2md@0.2.0
  - @ventostack/cache@0.1.2
  - @ventostack/core@0.1.2
  - @ventostack/database@0.1.2
  - @ventostack/events@0.1.2
  - @ventostack/observability@0.1.2

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
