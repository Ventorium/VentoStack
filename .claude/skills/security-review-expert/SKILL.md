---
name: security-review-expert
description: Use when reviewing VentoStack backend code, configs, manifests, or architecture work after implementation for web attack surface, trust boundary violations, tenant isolation leaks, secret exposure, AI tool abuse, and runtime or container hardening gaps.
---

# Security Review Expert

## Overview

把实现后的系统当成攻击目标来审查。优先找可被利用的路径、错误的信任假设、默认不安全配置，以及"文档说有，运行时未强制"的控制失效点。

## When To Use

- 新增或重构认证、授权、JWT、Session、API Key、Webhook、上传、缓存、队列、Worker、AI Tool、Docker、Kubernetes 相关能力时
- 合并前、发布前、事故复盘后做安全复查时
- 审核架构文档、部署清单、配置模板是否真的能落到实现时

不要用于纯视觉样式、纯文案或与后端和部署边界无关的改动。

## Review Order

1. 先读 CLAUDE.md，再读改动文件与部署清单。
2. 画清楚信任边界：client、proxy、app、worker、db/redis/s3、container、k8s、ci。
3. 依次检查：
   - 请求入口：校验、大小/深度限制、CORS、CSRF、SSRF、Open Redirect、上传、限流、可信代理
   - 身份体系：JWT 算法白名单、密钥版本与轮换、Cookie 标记、API Key 哈希、HMAC 防重放
   - 授权与租户：tenant 强制注入、row-level 过滤、cache key namespace、raw SQL 逃生舱口
   - 数据与泄露：SQL 参数化、错误脱敏、日志脱敏、docs/metrics/debug 暴露面
   - AI/Tool：Schema 校验、allowlist、人工审批、文件/网络/进程限制、审计记录
   - 运行时：非 root、只读根文件系统、capabilities、seccomp、resource limit、NetworkPolicy、最小 RBAC
   - 供应链：bun.lock、依赖新增理由、安装脚本、漏洞扫描与产物溯源
4. 只有存在真实风险、错误边界或缺少强制机制时才报问题，避免泛泛建议。

## Output Format

- Findings first，按 P0 / P1 / P2 排序
- 每条结论必须包含：风险、利用路径或失败模式、受影响文件、修复建议
- 之后列 Open Questions / Assumptions
- 最后补 Residual Risks 和 Missing Tests

## Common Misses

- 盲信 X-Forwarded-* 或 X-Real-IP
- tenant_id 只存在于约定里，不存在于强制检查里
- cache key、对象存储路径、异步任务缺少 tenant namespace
- /docs、/metrics、/ready 在生产环境裸露
- Worker 只有 timeout，没有 CPU / memory / fs / network 限制
- nonce 去重不是原子操作，签名可重放
- 日志、trace、错误对象里泄露 token、cookie、secret
- 容器仍可写根文件系统，或保留默认 capabilities
- 输入校验没有请求大小、JSON 深度、上传大小边界

## Security Rules (2024 Security Audit)

以下规则由安全审计修复后引入，审查时必须逐项确认：

### 认证与路由

- **所有非公开 API 必须绑定在认证中间件后**：路由挂载在 protected router（经 authMiddleware 保护）或使用 `createCrudRoutes` 自动注入。无认证的公开路由必须显式标注并评估风险。
- **权限标识符必填**：每条业务路由必须携带 `perm("resource:action")` 权限中间件。超管角色（`admin`）自动跳过，但不影响其他角色。
- **管理端点独立端口**：`ADMIN_PORT > 0` 时健康检查、指标、OpenAPI 文档绑定独立端口；`ADMIN_PORT = 0` 时不推荐用于生产。

### Schema 校验

- **Schema strict 模式默认开启**：`strict` 默认 `true`，拒绝未知字段。显式设置 `strict: false` 需要安全审查审批。
- **所有外部输入必须经 Schema 校验**：query、body、headers、formData 均需声明 Schema。

### 审计与脱敏

- **审计日志 metadata 自动脱敏**：`auditLog.append()` 的 `metadata` 字段经 `sanitize()` 递归脱敏（27 个默认敏感字段 + 自定义字段）。
- **操作日志请求体自动脱敏**：`createOperationLogMiddleware` 对 31 个敏感字段递归替换为 `"******"`。
- **IP 提取依赖可信代理**：仅直接连接 IP 匹配 `trustedProxies` 列表时才读取代理头，空列表 = 不信任任何代理。

### Row Filter 与数据隔离

- **Row Filter 必须参数化查询**：`createRowFilter().buildWhereClause()` 返回 `ParameterizedClause`（`$1, $2, ...`），禁止使用 `formatSqlLiteral`（已 deprecated）。
- **缓存键支持租户命名空间**：`createCacheKeyNamespace(tenantId)` 生成 `tenant:${tenantId}:key` 格式，多租户场景必须使用。

### AI 沙箱

- **沙箱默认拒绝所有工具**：`allowedTools` 为空时 `canExecute()` 返回 `false`，必须显式配置白名单。
- **文件/网络访问默认关闭**：`allowFileRead`、`allowFileWrite`、`allowNetworkAccess` 默认 `false`，开启时必须提供 `workingDirectory` / `allowedHosts`。

## Review Standard

优先给出可验证证据，而不是只转述设计意图。能通过测试、配置、清单、代码路径证明的问题，优先用证据说话。

## Security Review Mindset (Andrej Karpathy Style)

### 像攻击者一样思考
- **攻击面分析**：这段代码暴露了多少攻击面？每个输入点都是潜在的突破口
- **信任边界突破**：跨边界的数据是否都被视为不可信？有没有隐式的信任假设？
- **权限提升路径**：普通用户能否通过构造请求获得更高权限？
- **信息泄露通道**：错误信息、日志、调试接口是否泄露了敏感信息？

### 像审计员一样思考
- **证据链完整性**：每个安全关键操作是否有完整的审计记录？
- **配置即代码**：安全策略是否通过代码/配置强制执行，而非文档约定？
- **默认安全**：新功能默认是否安全？是否需要显式开启才安全？
- **可验证性**：安全声明能否通过测试或扫描验证？

### 深度审查方法
1. **数据流追踪**：从每个输入点开始，追踪数据如何流经系统，在哪里被处理、存储、返回
2. **权限矩阵检查**：每个端点 × 每个角色，确认权限检查是否存在且正确
3. **错误路径覆盖**：不仅看成功路径，重点看所有错误处理分支
4. **时间维度**：考虑并发、时序、重放、过期等时间相关攻击
5. **边界条件**：零长度、最大值、空值、特殊字符、Unicode、超长输入

### 根因分析
- 不满足于修复表面症状
- 追问：为什么这个漏洞可能存在？是设计缺陷还是实现疏忽？
- 同类漏洞是否在其他地方也存在？
- 如何通过架构或流程改进防止同类问题再次发生？
