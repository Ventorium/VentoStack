# @ventostack/observability

日志、指标、链路追踪、健康检查、审计。

## 模块定位

可观测能力层，依赖 core。提供结构化日志、Prometheus 指标、OpenTelemetry 链路追踪、审计日志存储和错误上报。

## 安全特性

### 日志脱敏

`createLogger()` 内置 `DEFAULT_SENSITIVE_FIELDS`（27 个字段），所有日志输出自动递归脱敏：

password, token, secret, key, cookie, authorization, phone, email, idcard, creditcard, ssn, apikey, access_token, refresh_token, private_key, connection_string, database_url, sessionid, session_id, resettoken, reset_token, temptoken, temp_token, mfarecovery, mfa_recovery, refreshtoken, refresh_token_jti

匹配规则：字段名不区分大小写，命中时替换为 `"***"`，支持嵌套对象和数组。

自定义敏感字段通过 `sensitiveFields` 选项追加，不会覆盖默认列表。

### 审计日志

- **metadata 自动脱敏**：`auditLog.append()` 写入时，`metadata` 字段经 `sanitize()` 递归脱敏，防止 email、token、sessionId 等信息进入审计存储
- **SHA-256 哈希链**：每条审计记录包含 `hash` 和 `previousHash`，形成防篡改链。`verify()` 方法可校验链完整性
- **记录内容**：actor、action、resource、result、timestamp，不记录完整请求体

### 错误上报

- `capture()` 上报时 `context` 数据自动递归脱敏，防止敏感信息泄露到外部通道（Sentry、钉钉等）
- 支持采样率 `sampleRate` 和忽略模式 `ignorePatterns`
- 生产环境不应上报完整堆栈到用户可见通道

## 编码约束

- 新增日志字段时检查是否包含敏感信息，敏感字段必须加入 `sensitiveFields`
- 审计日志只记录操作摘要，不记录完整 payload
- `LogEntry` 扩展字段不得包含未脱敏的 PII
