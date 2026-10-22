# AI 连接器（Connectors）设计

> 状态：设计稿 v1（2026-10-21）
> 关联模块：`@ventostack/ai`、admin 前端 `/app/ai` 能力页与 Chat 页

---

## 1. 定位与目标

**连接器 = 预设目录元数据 + 授权流 + 托管的 MCP 接入**。用户不需要理解 MCP 协议、手填 URL/凭证，从目录里选一个服务、完成 OAuth 授权（或填 API Key）即可在 Agent / 会话中使用其工具。

与现有能力的关系：

| 概念 | 语义 | 现状 |
|---|---|---|
| MCP 服务（`ai_mcp_server`） | 租户级、手动配置的 MCP 端点 | 已实现（stdio/sse，工具快照） |
| 连接器（本设计） | 平台预设的服务目录 + 授权流，最终**落地为一条 MCP 服务记录**（remote 模式）或 gateway 适配器 | 未实现 |
| 自定义 MCP | capabilities 页手动填写的口子 | 已实现，保留 |

设计原则：

1. **连接器层薄，MCP 层厚**。优先接入有官方 Remote MCP 的服务（飞书、Atlassian、GitHub、Notion、Google、Slack 等），平台只维护目录元数据、OAuth 凭证代理、工具白名单/审批策略，不写协议适配代码。无官方 MCP 的服务（微信读书、QQ 音乐等）后续再评估 gateway 适配器，第一阶段不做。
2. **复用现有管线**。连接器连接成功后生成的就是 `ai_mcp_server` 记录（`origin: connector`），Agent 绑定、会话勾选、工具发现、审批全部复用现有链路，不新增第二套执行面。
3. **两级 scope**：
   - `tenant`：租户管理员连接的企业共享服务（飞书企业自建应用、Confluence 站点、企业 GitHub org）；
   - `user`：用户连接的个人账号服务（个人 Notion、个人 GitHub、微信读书）。
   两者都进会话勾选池，用户级只能由本人使用。

## 2. 数据模型

### 2.1 `ai_connector_catalog` — 连接器目录（平台预设 + 租户可扩展）

```text
id            varchar(36) PK
kind          varchar(64)   -- 服务标识，如 feishu / atlassian / github / notion
name          varchar(128)
description   text
category      varchar(32)   -- office | knowledge | productivity | dev | search | media
icon          varchar(512)  -- 图标 URL（或内置图标 key）
auth_type     varchar(32)   -- oauth2 | api_key | personal_token | custom_fields
transport     varchar(16)   -- remote（一期仅 remote；gateway/internal 二期）
mcp_url       varchar(1024) -- 官方 MCP 端点（remote 模式必填）
auth_template json          -- OAuth: authorize/token URL、client_id 环境变量名、scope 默认值
                              -- api_key: 凭证字段定义 [{key,label,secret,placeholder,help}]
required_plan varchar(32) nullable -- 预留：版本/套餐门控
built_in      boolean       -- 平台内置目录（seed 写入）= true
sort_order    int
enabled       boolean
tenant_id     varchar(36) default 'default'  -- 内置目录归 'default'；租户可自建私有目录项
```

- 内置目录通过 migration/seed 写入，与代码版本一起演进（对应 Octop 的 `catalog.json`）。
- `auth_template` 中 OAuth 的 `client_secret` 不存目录表——从部署环境变量读取（如 `CONNECTOR_FEISHU_CLIENT_SECRET`），目录表只存变量名，避免密钥入库。

### 2.2 `ai_connector_binding` — 连接绑定（谁连了什么）

```text
id             varchar(36) PK
connector_id   varchar(36)   -- FK -> ai_connector_catalog
scope          varchar(16)   -- tenant | user
owner_id       varchar(36)   -- scope=tenant 时为 tenant_id 本身；scope=user 时为 user_id
display_name   varchar(128)  -- 用户可见名，如 "我的 Notion"、"公司飞书"
status         varchar(16)   -- pending | connected | expired | revoked | error
credentials    text          -- 加密存储（复用 credentialEncryptor）：
                             --   oauth2: { access_token, refresh_token, expires_at, token_type, scope }
                             --   api_key/personal_token: { <auth_template 定义的 key>: value }
account_hint   varchar(128) nullable -- 脱敏的账号提示（如 "u***@example.com"），绝不存完整凭证
last_refresh_at  timestamp nullable
last_error     text nullable
tenant_id      varchar(36)
created_at / updated_at
UNIQUE (connector_id, scope, owner_id, tenant_id)
```

### 2.3 连接器 → MCP 的桥接（不落新表，落视图语义）

连接成功后由 service 创建/更新一条 `ai_mcp_server`：

```text
ai_mcp_server 增加一列：
  connector_binding_id  varchar(36) nullable  -- 非空即表示该 MCP 由连接器托管
  origin                varchar(16) default 'custom'  -- custom | connector
```

- `url` 由目录的 `mcp_url` 派生；`headers` 不再手填，而是**运行时注入**：出站前由连接器服务把 `credentials` 解密后组装 Authorization 头（`Bearer <access_token>` / API Key 头），**凭证不落 ai_mcp_server.headers 明文列**。
- token 过期：请求前惰性检查 `expires_at`，过期用 `refresh_token` 刷新并回写绑定表；刷新失败置 `expired`，会话中该 MCP 的工具调用 fail-closed 并提示重新授权。
- 解绑（revoked）：删除 binding 时级联停用对应 `ai_mcp_server`（`enabled=false`）并从所有 Agent 绑定中移除；**不级联删除**会话勾选历史（勾选只是 ID，不命中即忽略，现有行为已兼容）。

### 2.4 为什么不建 `ai_agent_connector` 关联表

Agent 绑定继续只认 `ai_mcp_server`（现有 `ai_agent_mcp` 表与 `agent.mcp_server_ids` 不动）。连接器托管 MCP 后自动进入现有绑定/勾选池。这是"复用管线"原则的直接结果，避免双轨。

## 3. 后端服务与路由

```text
packages/framework/ai/src/
├── models/connector.ts          ← 2.2/2.1 两个模型
├── migrations/019_create_ai_connector_tables.ts
├── services/connector.ts        ← createConnectorService({ db, cache, credentialEncryptor, auditStore, tenantId })
└── routes/connector.ts          ← 见下
```

`createConnectorService` 职责：

1. `listCatalog(category?, search?)` — 目录列表（内置 + 本租户自建），合并展示每个 kind 在当前租户/用户下的绑定状态。
2. `connect(kind, scope, params)` —
   - `oauth2`：生成 state（含 scope/owner/tenant，Redis 存 10 分钟），返回授权跳转 URL；`callback(state, code)` 换 token、加密入库、创建托管 MCP、触发一次 `refreshTools`。
   - `api_key/personal_token`：按 `auth_template` 校验字段（长度/格式），加密入库，同上。
3. `disconnect(bindingId)` — 按归属校验（user 只能解自己的，tenant 需要 `ai:connector:manage` 权限），级联停用 MCP。
4. `resolveAuthHeaders(binding)` — 供 `services/mcp-server.ts` 出站调用前取解密凭证并组装 headers（含 token 惰性刷新）。
5. 审计：`connector.connect/disconnect/refresh_token_fail` 写 `auditStore`（谁、何时、连了什么、结果），凭证本体绝不入审计。

路由（全部走现有鉴权 + 租户中间件）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/connectors/catalog` | 目录 + 各项当前绑定状态 |
| POST | `/api/ai/connectors/:kind/connect` | 发起连接（oauth2 返回跳转 URL；api_key 返回待填字段） |
| GET | `/api/ai/connectors/oauth/callback` | OAuth 回调（state 校验、防 CSRF/重放） |
| DELETE | `/api/ai/connectors/bindings/:id` | 解绑 |
| POST | `/api/ai/connectors/bindings/:id/reauthorize` | 重新授权（token 失效时） |

OpenAPI 描述必须包含：scope 语义（tenant 由认证上下文确定、user 由 `ctx.user.id` 注入且不接受请求参数）、跨租户/跨用户绑定按 404 处理。

## 4. 前端信息架构

### 4.1 capabilities 页（`/app/ai/capabilities`）

现有 4 tab（技能/专家/MCP 服务/工具）改为 5 tab：

```text
连接器 | 技能 | 专家 | MCP 服务 | 工具
```

- **连接器 tab**（新增，作为 tab 首项）：按分类分组的目录卡片墙。每张卡片：图标、名称、一句话能力、鉴权方式徽标、当前绑定状态（未连接 / 已连接·个人 / 已连接·本租户）。点「连接」→ Modal：oauth2 类跳授权页；api_key 类按字段表单填写。已绑定卡片显示「管理」（查看账号提示、重新授权、解绑）。
- **MCP 服务 tab**：保留现有自定义 MCP 管理，列表中 connector 托管的记录显示来源徽标「连接器」且 URL/headers 只读（编辑入口跳转连接器管理）。

### 4.2 Chat 页「能力配置」Popup（`/app/ai/chat/:agentId`）

顶部右侧现有的 工具/技能/MCP/知识库 四个 `Popover` 收敛为一个按钮「能力配置」→ Modal（或 Drawer）：

```text
┌─────────────────────────────────────────────┐
│ 能力配置                              [完成] │
├──────────┬──────────────────────────────────┤
│ 连接器    │  （当前 tab 的内容区）             │
│ MCP 服务  │                                  │
│ 工具      │                                  │
│ 技能      │                                  │
│ 知识库    │                                  │
└──────────┴──────────────────────────────────┘
```

- 左侧 tab：**连接器**（新增）/ MCP 服务 / 工具 / 技能 / 知识库。原四个 Popover 的 checkbox 逻辑平移到对应 tab 内容区。
- **连接器 tab**：列出所有可用绑定（个人 + 本租户共享），checkbox 启用/停用，底部「+ 连接新服务」跳 capabilities 连接器 tab（或内嵌精简目录）。
- 启用语义与现有请求参数对齐：连接器勾选 → 汇总为其托管 `ai_mcp_server` 的 id 并入 `mcpServerIds`；MCP/工具/技能/知识库 tab 维持现有 `mcpServerIds`/`tools`/`skillIds`/`knowledgeBaseIds`。
- **知识库 tab 标注交集语义**：显示「从 Agent 绑定的知识库中选取」提示（后端 `agent-loop.ts` 取的是交集，会话勾选只能缩小范围）。
- **会话开关落库**（本次一并做）：`ai_conversation` 新增 `enabled_capabilities` JSON 列：
  `{ tools?: string[], skillIds?: string[], mcpServerIds?: string[], connectorBindingIds?: string[], knowledgeBaseIds?: string[] }`
  打开会话时读取回填 state，切换时 PATCH 保存。未显式保存过 = 跟随 Agent 默认（列值为 NULL 的语义），保持向后兼容。

## 5. 一期接入清单（官方 Remote MCP 优先）

| 优先级 | 连接器 | auth | 官方 MCP 端点形态 |
|---|---|---|---|
| P0 | 飞书 | OAuth2 | 官方 Remote MCP（开放平台） |
| P0 | Notion | OAuth2 | 官方 Remote MCP |
| P0 | GitHub | PAT / OAuth | `api.githubcopilot.com/mcp/` |
| P1 | Atlassian（Jira+Confluence） | OAuth 2.1 | `mcp.atlassian.com/v1/sse` |
| P1 | Google Drive | OAuth2 | 官方 Remote MCP |
| P1 | Slack | OAuth2 | 官方 Remote MCP |
| P2 | 语雀 | personal_token | 官方 stdio（一期若只做 remote 则暂缓或经 gateway） |
| P2 | Linear / Todoist(滴答清单已有官方) | OAuth2 | 官方 Remote MCP |
| P3 | 微软 365（Outlook/Teams/OneDrive） | OAuth2 | 官方 Remote MCP |

一期仅实现 `transport: remote`；目录表中的 `gateway`/`internal` 模式字段保留枚举但服务端返回「暂不支持」。腾讯系/媒体类（微信读书、QQ 音乐等）等有真实需求再评估 gateway 适配器。

## 6. 安全基线（对照 AGENTS.md）

- **租户隔离**：`ai_connector_binding` 所有查询强制 `tenant_id` + 归属校验（scope=owner_id）；跨租户/跨用户一律 404。
- **凭证**：加密落库（`credentialEncryptor`，`AI_CREDENTIAL_ENCRYPTION_KEY`）；OAuth `client_secret` 只从环境变量读取；`account_hint` 脱敏；日志/审计/错误信息不出现 token。
- **OAuth 回调**：state 一次性（Redis TTL）绑定 scope/owner/tenant + 随机 nonce，防 CSRF 与授权置换；redirect_uri 白名单按环境配置。
- **出站约束**：托管的 MCP 请求强制走服务端代理（复用现有 SSE 出站路径），URL 必须等于目录 `mcp_url`（不允许绑定层改写目标端点）。
- **工具风险**：连接器工具默认继承 `mcp-tool-source.ts` 的 `riskLevel: critical → 人工审批` 策略；目录 `auth_template` 可按 kind 声明只读工具白名单以降级审批（后续迭代）。
- **暴露面**：`/api/ai/connectors/oauth/callback` 是唯一匿名端点（仅校验 state）；其余端点按 `ai:connector:connect`（个人）/ `ai:connector:manage`（租户）权限守卫。

## 7. 实施切分

1. **M1 数据层**：migration 019 + 模型 + `ai_mcp_server` 增加 `connector_binding_id`/`origin` 列；内置目录 seed（P0 三个）。
2. **M2 服务层**：`connector.ts` 服务 + 路由 + OAuth 流 + 出站 header 注入改造（`mcp-server.ts` 增加可选 auth provider 钩子）。
3. **M3 前端**：capabilities 连接器 tab；chat 能力配置 Popup 合并 + 连接器 tab + `enabled_capabilities` 落库。
4. **M4 测试**：租户/用户隔离回归（同租户可见、跨租户 404、fail-closed）、OAuth state 防重放、token 刷新失败降级、解绑级联、会话开关持久化。

## 8. 待定问题

- OAuth 回调的前端跳转体验（独立路由页 vs Popup 内轮询 state 完成态）。
  - 答：popup内轮询
- 租户共享连接器是否需要管理员审批用户可见性（一期：租户绑定全员可见可用）。
  - 答：不要做共享，每个用户链接自己的连接器，用户间隔离
