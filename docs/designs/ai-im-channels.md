# AI 对话渠道（IM Channels）设计

> 状态：设计稿 v2（2026-10-21）
> 关联模块：`@ventostack/ai`、`@ventostack/boot`、新增 `@ventostack/ai-channel`、admin 前端 `/app/ai/channels`
> 前置阅读：`ai-connectors.md`（连接器 ≠ 渠道，见 §1.2）
> v2 变更：新增 `SessionService` 统一抽象；渠道数据全部入库；渠道收敛为 6 个（含腾讯官方微信 iLink）；新增群聊支持矩阵；配置默认值体系；自动推送改为子智能体。

---

## 1. 定位与边界

### 1.1 一句话

**渠道 = 用户自己的一个 IM / IoT 机器人身份 + 一条「外部会话 ↔ AI 会话」的绑定。**
配置并启用后，用户在微信/QQ/飞书/钉钉/企业微信/MQTT 设备里直接和同一个 Agent 对话，会话延续到 Web 端；反过来，Web 会话里的 Agent 可以把结果主动推送到指定渠道，**用户在那个渠道回复时接的是同一份上下文**。

### 1.2 与「连接器（Connectors）」的区别

| 维度 | 连接器（`ai-connectors.md`） | 渠道（本文） |
|---|---|---|
| 数据方向 | Agent **调用**外部服务（读 Notion、查 Jira） | 外部用户 **发起**对话 / Agent **推送**结果 |
| 承载内容 | 工具调用（MCP tool） | 自然语言消息 |
| 会话语义 | 无会话，一次调用一次结算 | 有会话，长期延续、可 `/新对话` |
| 落地形态 | `ai_mcp_server` + binding | `ai_channel` + `ai_channel_session` |
| 用户心智 | "让 AI 能读我的笔记" | "在 QQ 里也能找到这个 AI" |

复用点：凭证加密、审计、租户隔离、限流、OpenAPI 描述规范。

### 1.3 目标

1. **个人用户级**：每个用户配置自己的机器人凭证，互不可见、互不可用。
2. **可配置、可启停**：每个渠道独立配置、独立启用/禁用、独立健康状态；**能默认的都默认，能引导的都引导**。
3. **一套适配器契约**：新增渠道只写一个 adapter，不碰核心管线。
4. **会话一一对应且可追溯**：外部会话 ↔ AI session 一对一；Web 会话列表能看到"这条来自微信"。
5. **双向闭环**：入站与出站走同一个 `sessionId`，用户追问"任务失败在哪"时上下文完整。
6. **默认安全**：长连接/轮询凭据加密；未绑定身份 fail-closed；出站域名白名单。

### 1.4 非目标（v2）

| 不做 | 原因 |
|---|---|
| 微信公众号、微信客服 | 纯 webhook 回调、被动回复 5 秒硬超时，无法真正双向交互 |
| 纯出站群机器人（企微/飞书/钉钉群 webhook） | 只能发不能收，无法交互（后续若需纯告警，各约 30 行 adapter 即可补） |
| Telegram / Slack / Discord / Matrix 等境外渠道 | 不在本轮范围 |
| WebChat 内嵌挂件 | 与现有 Chat 页重叠 |
| 邮件 / 短信 | 交互体验不符 |
| 微信个人号（hook / 协议逆向方案） | 见 §5.2：改用腾讯官方 iLink |
| QQ 非官方协议（OneBot / go-cqhttp） | 封号风险 |
| 多 Agent 路由（一个渠道切多个 Agent） | 一期一个渠道绑一个 Agent |
| 租户共享渠道 | 每人用自己的 |
| 富媒体收发（图片/语音/文件） | v2 再做（平台已有 OSS 存储能力，接口预留） |

---

## 2. 核心抽象

```
                    ┌──────────────────────────────────────────┐
                    │            Web / Admin 前端               │
                    │  /app/ai/channels   /app/ai/chat/:id      │
                    └───────────────┬──────────────────────────┘
                                    │ HTTP（鉴权）
┌───────────────────────────────────▼───────────────────────────────────┐
│                        @ventostack/ai-channel                         │
│                                                                       │
│   ChannelService   IdentityService   SessionLink   OutboundQueue       │
│        │                 │                │              │              │
│   ┌────▼─────────────────▼────────────────▼──────────────▼──────────┐  │
│   │                     Inbound Pipeline                            │  │
│   │ 归一化 → 幂等去重 → 身份解析 → 命令解析 → session 解析          │  │
│   │ → 串行锁 → agentLoop.runStream → 聚合回复 → outbound            │  │
│   └──────────────────────────────┬──────────────────────────────────┘  │
│                                  │                                     │
│   ┌──────────────────────────────▼──────────────────────────────────┐  │
│   │              Adapter Registry (type → adapter)                  │  │
│   │  parse() / send() / start() / stop() / health() / login*()      │  │
│   └───┬────────┬────────┬────────┬────────┬────────┬───────────────┘  │
└───────┼────────┼────────┼────────┼────────┼────────┼──────────────────┘
        │        │        │        │        │        │
    ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼────┐
    │ 微信 │ │ 飞书 │ │ QQ   │ │ 企微 │ │ 钉钉 │ │ MQTT   │
    │ iLink│ │ 应用 │ │ 官方 │ │ 应用 │ │Stream│ │  IoT   │
    │长轮询│ │长连接│ │webhook│ │webhook│ │长连接│ │ 长连接 │
    └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────────┘

        ▲ 外部消息                    │ 出站消息
        │                            ▼
   ┌────┴──────────────────────────────────────┐
   │           @ventostack/ai (既有)            │
   │  SessionService / agentLoop / memory      │
   └───────────────────────────────────────────┘
```

### 2.1 术语

| 术语 | 定义 |
|---|---|
| **Channel** | 一条渠道实例 = 平台类型 + 用户凭证 + 策略配置 |
| **External key** | 外部会话稳定标识，见 §11.3 |
| **Session link** | `(channelId, externalKey) → sessionId` 绑定 |
| **Identity** | 外部账号（openid / userid / deviceId）→ 平台用户 |
| **Inbound / Outbound** | 外部 → Agent / Agent → 外部 |
| **Notify** | 出站的一种：Agent 主动发起，不是对某条消息的回复 |

---

## 3. 数据模型

> **全部入库。** v1 曾把渠道会话级设置写进会话 jsonl 的 custom entry，那是错的——
> jsonl 没有索引、跨会话查询是 O(N)、无法与 DB 写入同事务。详见 §4.3。

新增迁移：`packages/platform/ai-channel/src/migrations/001_create_ai_channel_tables.ts`
（`__migrations` 按 name 全局唯一，与 `001_create_notify_tables` 不冲突）
另需 `packages/framework/ai/src/migrations/019_create_ai_session_meta.ts`（`ai-connectors.md` 占 019 → 本设计改用 **020**）。

### 3.1 `ai_channel` — 渠道实例

```sql
CREATE TABLE IF NOT EXISTS ai_channel (
  id              VARCHAR(36) PRIMARY KEY,
  tenant_id       VARCHAR(36) NOT NULL,
  user_id         VARCHAR(36) NOT NULL,            -- 个人渠道，不做租户共享
  type            VARCHAR(32) NOT NULL,            -- weixin-ilink | feishu-app | qqbot | wecom-app | dingtalk-app | mqtt
  name            VARCHAR(64) NOT NULL,
  config          JSONB       NOT NULL DEFAULT '{}',  -- 非密配置（可回显）
  secrets         TEXT,                               -- 加密凭证包（credentialEncryptor）
  runtime_state   JSONB       NOT NULL DEFAULT '{}',  -- 游标/票据/上次错误等运行态
  session_scope   VARCHAR(16) NOT NULL DEFAULT 'per-user',  -- per-user | per-chat
  agent_id        VARCHAR(36),                        -- 默认 Agent
  require_mention BOOLEAN     NOT NULL DEFAULT TRUE,  -- 群聊是否必须 @
  enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  status          VARCHAR(16) NOT NULL DEFAULT 'inactive', -- inactive|pending_login|connecting|active|degraded|error
  status_detail   TEXT,
  last_active_at  TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_owner
  ON ai_channel(tenant_id, user_id, type, name);
CREATE INDEX IF NOT EXISTS idx_ai_channel_enabled
  ON ai_channel(enabled, type);
```

**为什么 `config` / `secrets` / `runtime_state` 三列分开**

| 列 | 可回显 | 内容 | 例子 |
|---|---|---|---|
| `config` | ✓ | 非敏感、用户可改 | `appId`、`topicPrefix`、`sessionScope` |
| `secrets` | ✗（只回 `hasSecret`） | 加密凭证 | `appSecret`、`botToken`、`encodingAesKey` |
| `runtime_state` | 部分 | 系统维护的游标/票据 | `getUpdatesBuf`、`typingTicket`、`lastErrCode` |

`runtime_state` 单独一列的意义：`getUpdatesBuf` 这类游标**必须持久化**，否则进程重启后消息重放或丢失。它既不能放 `config`（用户会误改），也不能放 `secrets`（不是密文）。

### 3.2 `ai_channel_identity` — 外部账号绑定

```sql
CREATE TABLE IF NOT EXISTS ai_channel_identity (
  id               VARCHAR(36) PRIMARY KEY,
  channel_id       VARCHAR(36) NOT NULL REFERENCES ai_channel(id) ON DELETE CASCADE,
  tenant_id        VARCHAR(36) NOT NULL,
  user_id          VARCHAR(36) NOT NULL,
  external_user_id VARCHAR(191) NOT NULL,
  external_chat_id VARCHAR(191),      -- 私聊会话 id，主动推送用
  display_name     VARCHAR(128),
  verified_at      TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_identity_ext
  ON ai_channel_identity(channel_id, external_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_channel_identity_user
  ON ai_channel_identity(tenant_id, user_id);
```

### 3.3 `ai_channel_bind_code` — 绑定码

```sql
CREATE TABLE IF NOT EXISTS ai_channel_bind_code (
  code        VARCHAR(12) PRIMARY KEY,
  channel_id  VARCHAR(36) NOT NULL,
  tenant_id   VARCHAR(36) NOT NULL,
  user_id     VARCHAR(36) NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### 3.4 `ai_channel_session` — 外部会话 ↔ AI 会话

```sql
CREATE TABLE IF NOT EXISTS ai_channel_session (
  id              VARCHAR(36) PRIMARY KEY,
  channel_id      VARCHAR(36) NOT NULL REFERENCES ai_channel(id) ON DELETE CASCADE,
  tenant_id       VARCHAR(36) NOT NULL,
  user_id         VARCHAR(36) NOT NULL,
  external_key    VARCHAR(255) NOT NULL,   -- 见 §11.3
  session_id      VARCHAR(36) NOT NULL,
  agent_id        VARCHAR(36),
  origin          VARCHAR(16) NOT NULL,    -- inbound | notify
  reply_context   JSONB NOT NULL DEFAULT '{}',  -- 平台回复上下文
  last_message_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_session_key
  ON ai_channel_session(channel_id, external_key);
CREATE INDEX IF NOT EXISTS idx_ai_channel_session_sid
  ON ai_channel_session(tenant_id, session_id);
```

`reply_context` 存的典型内容：
- 微信 iLink：`{ contextToken, ilinkUserId }` —— **`context_token` 必须回传入站消息里的那个值，否则消息静默丢失**；
- 飞书：`{ chatId, receiveIdType }`；
- QQ：`{ groupOpenid | userOpenid, msgId }`；
- 钉钉：`{ openConversationId, conversationType }`。

放这里而不是 `runtime_state`：它是**每个外部会话一份**，不是每个渠道一份。

### 3.5 `ai_channel_message` — 幂等 + 出站队列 + 审计

```sql
CREATE TABLE IF NOT EXISTS ai_channel_message (
  id                  VARCHAR(36) PRIMARY KEY,
  channel_id          VARCHAR(36) NOT NULL,
  tenant_id           VARCHAR(36) NOT NULL,
  direction           VARCHAR(8)  NOT NULL,     -- in | out
  kind                VARCHAR(16) NOT NULL,     -- reply | notify | progress
  external_message_id VARCHAR(191),
  external_key        VARCHAR(255),
  session_id          VARCHAR(36),
  status              VARCHAR(16) NOT NULL,     -- received|processing|done|queued|sent|failed|dropped
  payload_preview     TEXT,                     -- 脱敏 + 截断 200 字
  error               TEXT,                     -- 脱敏摘要
  attempts            INT DEFAULT 0,
  next_retry_at       TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_msg_dedup
  ON ai_channel_message(channel_id, direction, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_channel_outbox
  ON ai_channel_message(status, next_retry_at) WHERE direction = 'out';
```

### 3.6 `ai_session_meta` — 会话的可查询投影（`@ventostack/ai`）

```sql
CREATE TABLE IF NOT EXISTS ai_session_meta (
  session_id          VARCHAR(36) PRIMARY KEY,
  tenant_id           VARCHAR(36) NOT NULL,
  user_id             VARCHAR(36) NOT NULL,
  agent_id            VARCHAR(36) NOT NULL,
  origin              VARCHAR(16) NOT NULL DEFAULT 'web',  -- web | channel | api
  origin_channel_id   VARCHAR(36),
  origin_channel_type VARCHAR(32),
  settings            JSONB NOT NULL DEFAULT '{}',         -- 按 namespace 分区：{ channel: {...}, ... }
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_session_meta_user
  ON ai_session_meta(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_session_meta_channel
  ON ai_session_meta(tenant_id, origin_channel_id);
-- 支撑"找出所有开启渠道通知的会话"（自动推送扫描用）
CREATE INDEX IF NOT EXISTS idx_ai_session_meta_notify
  ON ai_session_meta(tenant_id)
  WHERE (settings -> 'channel' ->> 'notifyEnabled') = 'true';
```

渠道模块写入的 `settings.channel` 结构：

```json
{
  "notifyEnabled": true,
  "notifyChannelIds": ["ch_xxx"],       // 空 = 用户全部已启用渠道
  "autoNotifyOnFinish": false,
  "notifiedAt": "2026-10-21T14:32:00Z"  // 最近一次通知时间（展示用）
}
```

---

## 4. `SessionService` —— 会话能力统一抽象

> 回应："创建 session 的能力倒是可以统一抽象下，这样多渠道只用调用 service，不关注具体怎么存储"

### 4.1 为什么要抽象

当前会话创建散落在调用方：

```ts
// chat.ts:293 / 840 / 964
const conv = await conversationService.create({ agentId, userId, tenantId });
```

`conversationService` 是 `module.ts:1163` 里内联的对象，只是 `memory.createSession()` 的薄封装。
渠道接入后会有 5 类调用方（Web 路由、IM 入站、通知子智能体、定时任务、CLI），
如果各自直接摸 `memory`，**存储细节会扩散到每个调用点**——用户担心的正是这一点。

### 4.2 接口

`packages/framework/ai/src/session-service.ts`

```ts
export interface SessionOrigin {
  kind: 'web' | 'channel' | 'api';
  channelId?: string;
  channelType?: string;
}

export interface SessionSettings {
  channel?: {
    notifyEnabled?: boolean;
    notifyChannelIds?: string[];
    autoNotifyOnFinish?: boolean;
    notifiedAt?: string;
  };
  [namespace: string]: unknown;
}

export interface SessionView {
  sessionId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: string;
  messageCount: number;
  origin: SessionOrigin;
  settings: SessionSettings;
  createdAt: string;
  updatedAt: string;
}

export interface SessionService {
  /** 新建会话：jsonl（真相源）+ ai_session_meta（投影） */
  create(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    title?: string;
    origin?: SessionOrigin;
  }): Promise<{ sessionId: string }>;

  get(sessionId: string, scope: MemoryScope): Promise<SessionView | null>;
  list(params: {
    tenantId: string; userId: string; agentId?: string; limit?: number;
  }): Promise<SessionView[]>;
  /** 软删除（移入回收站），同时清理 meta 行的活跃标记 */
  delete(sessionId: string, scope: MemoryScope): Promise<void>;

  appendMessage(sessionId: string, scope: MemoryScope, msg: SessionMessage): Promise<void>;
  getHistory(sessionId: string, scope: MemoryScope, limit?: number): Promise<SessionMessage[]>;

  /** 按 namespace 读/合并写会话设置（渠道模块只关心 'channel' 这一段） */
  getSettings<T = SessionSettings>(sessionId: string, scope: MemoryScope): Promise<T | null>;
  updateSettings(
    sessionId: string, scope: MemoryScope, patch: Partial<SessionSettings>,
  ): Promise<SessionSettings>;

  /** 启动时/运维用：把缺失的 jsonl 会话补进 meta 表 */
  backfill(scope?: MemoryScope): Promise<{ scanned: number; filled: number }>;
}
```

### 4.3 存储分层：什么进 DB，什么留在 jsonl

这是本节最关键的判断。

| 数据 | 存储 | 理由 |
|---|---|---|
| 消息正文 / 工具轨迹 / 分支 / 压缩摘要 | **jsonl**（不变） | 会话是一棵**树**（`SessionTreeEntry` 11 种 entry，支持 fork、branch_summary、compaction、leaf 移动）。关系表无法表达，硬搬会毁掉 fork/compaction 能力 |
| 会话 id / 归属 / origin / settings | **`ai_session_meta`** | 需要跨会话查询、需要索引、需要与渠道表同事务 |

**为什么 settings 必须入库**（v1 的错误）：

1. **查询**：自动推送要定时扫"哪些会话开了通知"。若在 jsonl 里，需要遍历 `memories/*/users/*/conversations/*.jsonl` —— 单租户上千用户时不可接受。
2. **索引**：上面那条 partial index 让扫描变成一次索引查找。
3. **一致性与事务**：`channel_send` 要同时「发消息」+「写反向绑定」+「记通知台账」。后两者在 DB 可以同事务；写 jsonl 是追加文件，无法与 DB 事务对齐。
4. **多实例**：jsonl 是本地文件，多实例部署时各实例看到不同磁盘。DB 是共享的。

**为什么不把消息正文也入库**：见上表——树的语义无法用表表达。`ai_conversation` 表就是历史上尝试过的产物，现在只有 `id/title/status` 几个壳字段，正文早已迁到 jsonl，是个反面教材。**不要重蹈覆辙**。

### 4.4 一致性策略：jsonl 为准，meta 可重建

```
create():
  1. memory.createSession()      // 先写真相源；失败 → 直接抛错，不产生孤儿 meta
  2. INSERT ai_session_meta      // 投影；失败 → 只记日志，不阻断
  3. 返回 sessionId
```

- 第 2 步失败不会让用户开不了会话（可用性优先）。
- `get()` / `list()` 发现某会话在 jsonl 存在但 meta 缺失 → **懒修复**：补插一行 `origin='web'`。
- 提供 `backfill()` 供运维一次性补齐。
- `updateSettings` 只写 meta（settings 不重复写 jsonl），避免双写分歧。

### 4.5 对既有代码的改动

| 位置 | 改动 |
|---|---|
| `module.ts:1163` 的 `conversationService` | 改为 `SessionService` 的薄适配（`create` 转发、`list` 合并 meta） |
| `routes/chat.ts` | `ConversationService` 接口替换为 `SessionService`（字段兼容，改动小） |
| `AIModule.services` | 新增 `sessionService`，供 `ai-channel` 与 `ai-context` 消费 |
| `chat.ts` 的 `createTenantToolRegistry` | 返回类型放宽为 `ToolRegistry \| Promise<ToolRegistry>`，2 处 `await`（§14.2） |

---

## 5. 渠道清单与能力矩阵

### 5.1 六个渠道，全部可交互

| P | type | 名称 | 入站 | 出站 | 接入方式 | 需公网 | 群聊 | 消息长度 | 官方 |
|---|---|---|---|---|---|---|---|---|---|
| **P0** | `weixin-ilink` | 微信（ClawBot） | ✓ | ✓ | 长轮询 35s | 否 | ✗ | 2048 | ✓ 腾讯 |
| **P0** | `feishu-app` | 飞书自建应用 | ✓ | ✓ | **长连接**（默认）/ webhook | 长连接免 | ✓ | 30 KB | ✓ |
| **P0** | `qqbot` | QQ 官方机器人 | ✓ | ✓ | webhook / WebSocket | webhook 需 | ✓ | 5000 | ✓ |
| **P0** | `wecom-app` | 企业微信自建应用 | ✓ | ✓ | webhook | **必须** | ✗ | 2048 | ✓ |
| **P1** | `dingtalk-app` | 钉钉企业内部应用 | ✓ | ✓ | **Stream**（默认）/ webhook | Stream 免 | ✓ | 5000 | ✓ |
| **P1** | `mqtt` | MQTT（IoT） | ✓ | ✓ | 长连接 | 否 | N/A | 64 KB | ✓ |

**默认值即最优解**：飞书默认长连接、钉钉默认 Stream——两者都**不需要公网地址**，用户填完 AppID/Secret 就能用。这对个人部署是最重要的默认值。
只有 QQ 和企微必须公网（QQ 也支持 WebSocket 模式免公网，见 §7.3）。

### 5.2 微信渠道：用腾讯官方 iLink，不是逆向个人号

`@tencent-weixin/openclaw-weixin`（`Tencent/openclaw-weixin`，MIT）是腾讯微信团队维护的**官方**微信渠道插件：

- 底层协议 **iLink**，接入域名 `https://ilinkai.weixin.qq.com`（腾讯官方服务器）；
- **扫码登录**授权，凭据本地保存；
- **长轮询**收消息（35 秒）；
- 支持文本 / 图片 / 语音 / 文件 / 视频；
- 能力元数据**只声明私信**，不支持群聊；
- 有官方协议文档 `docs/protocol.md`（面向"实现或集成兼容后端"的开发者）。

它与逆向个人号方案（hook 客户端、协议库）本质不同：**走腾讯官方网关、有官方文档、有官方插件维护**。
本设计实现一个 **iLink 客户端适配器**（不依赖 OpenClaw 运行时），协议细节见 §7.1。

风险仍需明说（写进前端 `catalog.warning`）：

- `bot_token` 的生命周期官方文档未给出绝对时长，社区实现观察到约 **24 小时**需重新扫码；
- **每次扫码登录 `ilink_bot_id` 会变化**；
- `getUpdates` 返回 `ret/-14` 时账户会话**暂停 1 小时**；
- 腾讯保留内容过滤与限速权利，且可随时变更或终止该服务；
- 因此定位为「个人助手入口」，不建议承载核心业务。

### 5.3 依赖决策（AGENTS.md §5.7 要求逐个说明）

| 渠道 | 新增依赖 | 为什么 Bun 内置不够 | 权衡 |
|---|---|---|---|
| 全部 | 无 | `fetch` / `crypto.subtle` / `Bun.CryptoHasher` 已覆盖 HTTP、HMAC、SHA、AES | — |
| `weixin-ilink` | 无 | iLink 是 JSON over HTTPS + Base64；AES-128-ECB 用 `node:crypto` 兼容层即可 | 零依赖 |
| `mqtt` | `mqtt`（MQTT.js） | Bun 无 MQTT；自研需实现 MQTT 3.1.1/5 报文编解码、QoS 1/2 状态机、重连与遗嘱，工作量远超收益 | 只在此 adapter 内引用，不外溢 |
| `feishu-app`（长连接） | `@larksuiteoapi/node-sdk` | 飞书长连接是私有 WS 帧协议，非标准 WebSocket 语义 | **可降级**：默认长连接，若不愿引依赖则切 webhook 模式（纯 `fetch`） |
| `dingtalk-app`（Stream） | `dingtalk-stream` | 钉钉 Stream 私有协议 | 同上，可降级为 webhook（需公网） |

> 结论：**P0 的微信 / QQ / 企微三个渠道零新增依赖**。飞书/钉钉的长连接各需一个官方 SDK，且都保留了 webhook 降级路径。

---

## 6. 群聊支持：能力矩阵与原理

### 6.1 支持情况

| 渠道 | 群聊 | 触发条件 | 谁负责 @ 过滤 |
|---|---|---|---|
| `qqbot` | ✓ | 必须 @ 机器人 | **平台侧**：未 @ 不推事件。但需企业主体资质，个人主体仅频道 |
| `feishu-app` | ✓ | 必须 @ 机器人 | **客户端侧**：飞书推送群内**所有**消息，必须自己判断 `mentions` |
| `dingtalk-app` | ✓ | 必须 @ 机器人 | **平台侧**：只推 @ 消息；`conversationType=2` 为群 |
| `wecom-app` | ✗ | — | 自建应用无群聊能力（群聊只有「群机器人」webhook，单向） |
| `weixin-ilink` | ✗ | — | 插件能力元数据仅声明私信 |
| `mqtt` | N/A | — | 无群概念，多设备靠 topic / deviceId 区分 |

### 6.2 原理：三件事

群聊不是"把群 id 当成用户 id"这么简单，要处理三件事：

**① 消息从哪来（触发）**

- **平台侧过滤**（QQ / 钉钉）：平台只在被 @ 时推送事件，天然省掉过滤逻辑，也天然省掉"别人聊天烧你 token"的风险。代价是拿不到未被 @ 的消息（其实这正是我们要的）。
- **客户端侧过滤**（飞书）：飞书会把群内每条消息都推过来。**必须在 parse 阶段就丢掉未 @ 的**，否则一群 50 人聊天会瞬间打爆 token 预算。判断依据：
  ```ts
  const botOpenId = cfg.config.botOpenId;          // 首次启动调 /open-apis/bot/v3/info 拉取并缓存
  const mentioned  = msg.mentions?.some(m => m.id?.open_id === botOpenId);
  if (chatType === 'group' && !mentioned) return { messages: [] };  // 直接丢弃，不落库
  ```

**② 说话的是谁（身份）**

`@` 事件里必须能拿到**发送者**的外部 id：

| 渠道 | 发送者字段 | 群 id 字段 |
|---|---|---|
| QQ | `author.member_openid` | `group_openid` |
| 飞书 | `sender.sender_id.open_id` | `message.chat_id` |
| 钉钉 | `senderStaffId` | `conversationId` |

拿到发送者 → 查 `ai_channel_identity` → 映射到平台 `user_id`。**未绑定 → 回绑定引导，不进 Agent**（fail-closed）。
这一步在群里比私聊更重要：群里可能有几十个人，不能因为一个人没绑定就把整个群拉黑，也不能让未绑定的人白嫖。

**③ 回到哪去（回复目标）**

回复必须发到**群**，不是发给个人：

| 渠道 | 回复接口 |
|---|---|
| QQ | `POST /v2/groups/{group_openid}/messages` |
| 飞书 | `POST /open-apis/im/v1/messages?receive_id_type=chat_id` |
| 钉钉 | `POST /v1.0/robot/groupMessages/send`（`openConversationId`） |

### 6.3 群里的会话隔离

`session_scope` 决定 `external_key`（见 §11.3）：

```
per-user（默认）  group:{chatId}:{userId}   → 群里每个人和 AI 有独立上下文
per-chat          group:{chatId}            → 全群共享一份上下文
```

**默认 per-user**：群里 A 问"我的订单号是多少"，B 不应该看到 A 的上下文。
`per-chat` 作为可选项，UI 上标注隐私风险（"群内成员将共享同一段对话"）。

### 6.4 群里的额外约束

- `require_mention = true`（默认）：必须 @ 才响应。关掉后会响应每条消息，UI 用 `Alert type="warning"` 提示成本风险。
- 群内限流更严：`per (channel, groupId, userId)` 10 条/分钟（私聊是 20）。
- 群里**不主动推送**（`channel_send` 只能发私聊；群通知需显式配置 `defaultTarget` 为群 id）。

### 6.5 微信群里能不能用？

不能。iLink 协议的消息体里有 `group_id` 字段，但官方插件的能力元数据只声明私信，
本设计按"未声明即不支持"处理：`group_id` 非空时记一条 `dropped` 指标并忽略，不猜、不试探。

---

## 7. 各渠道接入要点

### 7.1 `weixin-ilink`（微信 / ClawBot）

**协议**：iLink，JSON over HTTPS，Base URL `https://ilinkai.weixin.qq.com`

**公共请求头**

```
Content-Type: application/json
AuthorizationType: ilink_bot_token
Authorization: Bearer <bot_token>
X-WECHAT-UIN: <base64(十进制随机 uint32)>
iLink-App-Id: bot
iLink-App-ClientVersion: <0x00MMNNPP 的十进制字符串>
base_info: { channel_version: "<semver>", bot_agent: "VentoStack/1.0" }
```

**登录（扫码）**

```
POST /ilink/bot/get_bot_qrcode?bot_type=3
  body: { local_token_list: [] }          // 最多带最近 10 个 token
  → { qrcode, qrcode_img_content }
```

> **`qrcode_img_content` 是二维码要编码的内容，不是图片。**
> 官方返回的是 `https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=...&bot_type=3` 这种落地页 URL，
> 响应头是 `text/html`。把它直接塞进 `<img src>` 只会得到一张坏图，
> 必须由前端（antd `QRCode`）把这段字符串渲染成二维码图形。
> 对应实现里字段改名为 `qrcodeContent`，避免再被当成图片地址用。

```
GET /ilink/bot/get_qrcode_status?qrcode=<enc>
GET /ilink/bot/get_qrcode_status?qrcode=<enc>&verify_code=<enc>
  → { status, bot_token?, ilink_bot_id?, baseurl?, ilink_user_id?, redirect_host? }
```

`status` 状态机：

```
wait ──► scaned ──► confirmed          ✅ 存 bot_token / ilink_bot_id / baseurl
  │          └────► need_verifycode ──► (用户输入验证码) ──► confirmed
  │                        └──────────► verify_code_blocked  ❌ 刷新二维码
  ├──► expired                          刷新二维码
  ├──► scaned_but_redirect              改到 redirect_host 继续轮询
  └──► binded_redirect                  已绑定该实例
```

**收消息（长轮询）**

```
POST /ilink/bot/getupdates
  body: { get_updates_buf: "<上次游标>", base_info }
  → { ret, msgs: WeixinMessage[], get_updates_buf, longpolling_timeout_ms: 35000 }
```

- `get_updates_buf` **必须持久化到 `ai_channel.runtime_state.getUpdatesBuf`**，每次响应后更新。
- 服务端 hold 约 35 秒；客户端超时按空结果处理并立即重连，不要退避（长轮询超时是正常的）。
- `ret` 或 `errcode` 为 **`-14`** → 账户会话暂停 1 小时：置 `status='error'`，`status_detail='账户会话暂停，请稍后重试或重新扫码'`，**停止轮询 1 小时**，不要重试风暴。

**消息体（`WeixinMessage`）**

| 字段 | 说明 |
|---|---|
| `message_id` | 幂等键 |
| `from_user_id` | 发送者（`<id>@im.wechat`） |
| `to_user_id` | 接收者 |
| `message_type` | `1` 用户，`2` bot —— **只处理 `1`**，过滤掉自己发的回环 |
| `message_state` | `0` 新建 / `1` 生成中 / `2` 完成 —— 只处理 `2`，避免处理半截消息 |
| `item_list[].type` | `1` 文本 / `2` 图片 / `3` 语音 / `4` 文件 / `5` 视频 / `11` 工具调用开始 / `12` 工具调用结果 |
| `context_token` | **回复时必须原样回传**，用错或复用旧值 → HTTP 200 但消息静默丢失 |
| `group_id` | 群（本设计不支持，非空即丢弃） |

取文本：`item_list.find(i => i.type === 1)?.text_item?.text`；
`voice_item.text` 是转写文本，v2 支持语音时可用。

**发消息**

```
POST /ilink/bot/sendmessage
{
  "msg": {
    "from_user_id": "",
    "to_user_id": "<对方 id>",
    "client_id": "ventostack-<hex>",
    "message_type": 2,
    "message_state": 2,
    "context_token": "<入站消息里的那个>",
    "item_list": [{ "type": 1, "text_item": { "text": "回复内容" } }]
  },
  "base_info": { "channel_version": "1.0.0", "bot_agent": "VentoStack/1.0" }
}
→ { ret, errmsg }
```

**"正在输入"**

```
POST /ilink/bot/getconfig { ilink_user_id, context_token? }  → { ret, typing_ticket }
POST /ilink/bot/sendtyping { ilink_user_id, typing_ticket, status: 1 }   // 开始
POST /ilink/bot/sendtyping { ilink_user_id, typing_ticket, status: 2 }   // 结束
```

`typing_ticket` 按 user 缓存在 `cache`，TTL 24h。**收到消息立刻发 `status:1`，回复发出后发 `status:2`** —— 这是长任务体验的关键，用户不会以为机器人死了。

**生命周期**

```
启动 → notifyStart → getupdates 循环
停止 → notifyStop → 退出循环（供优雅关闭）
```

**实现映射**

| iLink 概念 | VentoStack 映射 |
|---|---|
| `bot_token` | `ai_channel.secrets.botToken`（加密） |
| `ilink_bot_id` | `ai_channel.config.ilinkBotId`（展示用） |
| `baseurl` | `ai_channel.config.baseUrl`（默认 ilinkai 域名，允许私有部署覆盖） |
| `get_updates_buf` | `ai_channel.runtime_state.getUpdatesBuf` |
| `context_token` | `ai_channel_session.reply_context.contextToken` |
| `from_user_id` | `ai_channel_identity.external_user_id` |
| `message_id` | `ai_channel_message.external_message_id`（幂等） |

### 7.2 `feishu-app`（飞书自建应用）

- **默认长连接**（`transport: 'long-conn'`），免公网；切 webhook 时：
  - URL 验证：body `{ type: 'url_verification', challenge }` → 原样回 `{ challenge }`；
  - 验签：`X-Lark-Signature = sha256(timestamp + nonce + encryptKey + rawBody)`，`X-Lark-Request-Timestamp` 校验 ±5 分钟；
  - 配置了 Encrypt Key 时 body 为 `{ encrypt }`，AES-256-CBC 解密。
- 事件：`im.message.receive_v1`；群聊需**自己判断 mentions**（§6.2）。
- 出站：`tenant_access_token`（`/open-apis/auth/v3/tenant_access_token/internal`，缓存 + 提前 5 分钟刷新）→ `POST /open-apis/im/v1/messages`。
- 机器人 open_id：启动时调 `/open-apis/bot/v3/info` 拿 `open_id` 存 `runtime_state.botOpenId`（群聊 @ 判断必需）。
- 支持**编辑已发消息**（`PATCH /open-apis/im/v1/messages/:id`）→ 可用于流式增量更新。

### 7.3 `qqbot`（QQ 官方机器人）

- 鉴权：`POST https://bots.qq.com/app/getAppAccessToken`（`appId` + `appSecret`）→ `access_token`，缓存 + 提前刷新。
- **入站有两种，默认 WebSocket**：
  - **WebSocket**（`wss://api.sgroup.qq.com/websocket`）：先取 `gateway` 地址 → `Identify`（`intents`）→ 心跳 → 收 `op:0` Dispatch。**免公网**，适合个人部署。
  - **Webhook**：`op:13` 是回调验证（用 AppSecret 派生 seed 对 `plain_token + event_ts` 做 **Ed25519** 签名回包）；`op:0` 事件需验 `X-Signature-Ed25519` + `X-Signature-Timestamp`；必须 5 秒内回 `op:12` ACK。
- 事件：`C2C_MESSAGE_CREATE`（单聊）、`GROUP_AT_MESSAGE_CREATE`（群 @）、`AT_MESSAGE_CREATE`（频道）。
- 出站：`POST /v2/users/{openid}/messages`、`POST /v2/groups/{group_openid}/messages`（需 `msg_id` + `msg_seq`）。
- **权限现实**：个人主体只能开频道；群聊/消息列表单聊需企业主体 + 申请。UI 上要明确提示，否则用户配完发现群里不响应。

### 7.4 `wecom-app`（企业微信自建应用）

- 入站：`GET` 验证（`echostr` 解密返回）；`POST` 消息体 AES-256-CBC 加密（微信 `WXBizMsgCrypt`），校验 `msg_signature = sha1(sort(token, timestamp, nonce, encrypt))`。
- **5 秒被动回复窗口**：超时平台重试 3 次。策略：立即返回空串 `success`，用**应用消息**接口异步补发。
- 出站：`GET /cgi-bin/gettoken` → `access_token`（7200s，提前 5 分钟刷新）→ `POST /cgi-bin/message/send`。
- **限流：每应用每分钟 20 条**，必须令牌桶 + 队列。
- 无群聊（§6.1）。

### 7.5 `dingtalk-app`（钉钉企业内部应用）

- **默认 Stream 模式**（`transport: 'stream'`）：客户端主动建长连接、免公网、免回调配置。
- webhook 模式备选：`timestamp` + `sign = base64(HmacSHA256(timestamp + "\n" + appSecret))` + AES 解密。
- 群消息 `conversationType=2`，取 `senderStaffId` 作外部用户 id，`conversationId` 作回复目标。
- **必须剥离 @**：`text.content` 里带 `@机器人名`，要 `replace(/@\S+\s*/g, '')` 后再送模型，否则污染输入。
- 出站：`/v1.0/oauth2/accessToken` → `/v1.0/robot/oToMessages/batchSend` 或 `/v1.0/robot/groupMessages/send`。

### 7.6 `mqtt`（IoT）

- Topic 约定（`topicPrefix` 默认 `ventostack`）：
  - 入站：`{prefix}/{channelId}/in`
  - 出站：`{prefix}/{channelId}/out/{deviceId}`
- Payload：`{ deviceId, text, sessionId?, ts }`，纯文本也接受（用 clientId 兜底 deviceId）。
- external key：`mqtt:{deviceId}`（MQTT 恒为 per-device，`session_scope` 不生效）。
- QoS 1，`retain: false`；优先 `mqtts://`。
- **安全**：只订阅精确 topic 字符串，**禁止 `#` / `+` 通配**；payload ≤ 64 KB；单设备 12 条/分钟。
- 作为 **M0 的端到端验证载体**：本地 `docker compose up mosquitto` 即可跑通全链路，无公网、无验签、无审核。

---

## 8. 适配器契约

```ts
export interface ChannelRuntimeConfig {
  id: string; tenantId: string; userId: string; type: string;
  config: Record<string, unknown>;        // 非密
  secrets: Record<string, string>;        // 已解密
  runtimeState: Record<string, unknown>;  // 游标/票据
  sessionScope: 'per-user' | 'per-chat';
  requireMention: boolean;
}

export interface InboundMessage {
  channelId: string; tenantId: string;
  externalMessageId: string;              // 幂等键
  externalKey: string;                    // §11.3
  externalUserId: string;
  externalChatId: string;
  externalUserName?: string;
  text: string;                           // 已剥离 @
  mentionsBot: boolean;
  chatType: 'dm' | 'group' | 'channel' | 'device';
  replyContext: Record<string, unknown>;  // 回传用（context_token 等）
  receivedAt: number;
}

export interface OutboundMessage {
  channelId: string;
  target: { externalChatId: string; externalUserId: string; replyContext?: Record<string, unknown> };
  text: string;
  kind: 'reply' | 'notify' | 'progress';
}

export interface SendResult { ok: boolean; messageId?: string; error?: string; retryable: boolean }

export interface ChannelAdapter {
  readonly type: string;

  /** 长连接/轮询类：建立连接，收到消息回调 sink。返回后连接由 runtime 托管 */
  start?(cfg: ChannelRuntimeConfig, sink: (m: InboundMessage[]) => Promise<void>): Promise<void>;
  stop?(channelId: string): Promise<void>;

  /** webhook 类：URL 验证（飞书 challenge / 企微 echostr / QQ op:13），就地应答 */
  verifyUrl?(req: Request, cfg: ChannelRuntimeConfig): Promise<Response>;

  /** webhook 类：验签 + 解密 + 归一化。验签失败必须 throw */
  parse?(req: Request, cfg: ChannelRuntimeConfig): Promise<{ messages: InboundMessage[]; ack?: Response }>;

  /** 出站（分片由 outbound 服务统一做） */
  send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult>;

  /** 连接期准备（拉 bot open_id、刷新 token 等） */
  prepare?(cfg: ChannelRuntimeConfig): Promise<Record<string, unknown>>;  // → runtimeState 增量

  /** 运行中周期性维护（token 刷新、typing 清理） */
  tick?(cfg: ChannelRuntimeConfig): Promise<void>;

  /** 健康探活 */
  health?(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }>;
}
```

**adapter 只做三件事：验签解密 → 归一化 → 发送。** 会话解析、命令、串行锁、LLM 调用全在管线里。
所以加一个渠道（比如微信客服）只需 ~200 行 adapter，自动获得命令、会话延续、限流、审计、幂等。

**扫码登录类渠道**（`weixin-ilink`）额外暴露一组生命周期方法（不放进 `ChannelAdapter`，因为只有它有）：

```ts
export interface QrLoginAdapter {
  beginLogin(cfg): Promise<{ qrcode: string; qrcodeContent: string; expiresIn: number }>;
  pollLogin(cfg, qrcode: string, verifyCode?: string):
    Promise<{ status: 'wait'|'scaned'|'confirmed'|'expired'|'need_verifycode'|'blocked';
              secrets?: Record<string, string>; configPatch?: Record<string, unknown> }>;
}
```

> `get_qrcode_status` 是长轮询，官方服务端在无状态变化时 hold 约 30 秒。
> 管理后台前端 fetch client 的全局超时是 10 秒，等满 30 秒一定先被前端 abort，
> 浏览器里就是一片 cancelled、UI 上还会显示成错误。
> 因此 adapter 把单次等待压到 6 秒（`QR_STATUS_TIMEOUT_MS`）：超时视为「无变化」返回 `wait`，
> 前端 2 秒后继续问；状态真正变化时服务端立即返回，所以扫码后的感知延迟接近 0。

---

## 9. 配置体系：默认值 + 引导

> 回应："渠道能配置的尽量配置，有默认值的尽量默认值，能提示怎么配置的尽量加提示或链接"

### 9.1 三层

| 层 | 位置 | 用户要做的事 |
|---|---|---|
| **平台默认** | `catalog.ts` 常量 | 什么都不用做 |
| **渠道默认** | `catalog.defaults` | 什么都不用做 |
| **必填** | `configFields.required` / `secretFields.required` | 只填 2~3 个字段 |

**设计目标：配一个渠道不超过 3 个必填字段 + 1 次扫码/点击。**

### 9.2 各渠道默认值

| 渠道 | 必填 | 默认值（不用填） |
|---|---|---|
| `weixin-ilink` | 无（扫码即可） | `baseUrl=https://ilinkai.weixin.qq.com`、`botAgent=VentoStack/1.0`、`channelVersion=<包版本>`、`pollTimeoutMs=35000`、`autoRelogin=true` |
| `feishu-app` | `appId`、`appSecret` | `transport=long-conn`（免公网）、`domain=feishu`、`streamingReply=false`、`maxMessageLength=30000` |
| `qqbot` | `appId`、`appSecret` | `transport=websocket`（免公网）、`sandbox=false`、`intents=<固定集合>`、`maxMessageLength=4500` |
| `wecom-app` | `corpId`、`agentId`、`secret`、`token`、`encodingAesKey` | `baseUrl=https://qyapi.weixin.qq.com`、`rateLimit=20/min`、`asyncReply=true`（5 秒超时兜底） |
| `dingtalk-app` | `appKey`、`appSecret` | `transport=stream`（免公网）、`stripMention=true`、`maxMessageLength=4500` |
| `mqtt` | `brokerUrl` | `port=8883`、`qos=1`、`retain=false`、`topicPrefix=ventostack`、`maxPayloadBytes=65536`、`allowInsecure=false` |
| 全部 | — | `sessionScope=per-user`、`requireMention=true`、`replyProgressMessages=false`、`streamingReply=false` |

### 9.3 引导设计

每个 `ChannelField` 带 `help`（一句话）+ `docsUrl`（文档深链）+ `placeholder`（真实格式示例）：

```ts
{
  key: 'appSecret',
  label: 'App Secret',
  type: 'password',
  required: true,
  placeholder: '例如：a1b2c3d4e5f6...',
  help: '飞书开放平台 → 你的应用 → 凭证与基础信息 → App Secret',
  docsUrl: 'https://open.feishu.cn/document/home/introduction-to-custom-app-development',
}
```

**UI 上的四类帮助**

1. **字段级**：`help` 文字 + `placeholder` 格式示例 + `docsUrl` 的「查看文档 ↗」图标。
2. **配置步骤**：表单顶部的可折叠 `Collapse`，编号步骤（1. 去哪建应用 2. 抄哪两个值 3. 配什么权限 4. 把 URL 填回哪）。**由 `catalog.setupGuide` 驱动**，不写死在页面里。
3. **回调地址**：`transport='webhook'` 的渠道，自动展示 `https://<publicBaseUrl>/api/ai/channels/inbound/<id>` + 一键复制 + 「这个地址要填到飞书后台的『事件订阅』里」的说明。
4. **状态反馈**：保存后立即做一次连通性校验（`health()`），失败时把平台原始错误码翻译成人话（如企微 `40001` → "Secret 不正确"）。

**长连接渠道的特殊引导**：显示「无需公网地址，保存后自动连接」，并给连接状态灯 + 「最近一次连接失败原因」。

**扫码渠道的特殊引导**：保存后直接弹二维码 Modal，带状态文案（等待扫码 / 已扫码，请在手机上确认 / 二维码已过期，点击刷新 / 需要输入验证码），成功后自动关闭并开始工作。

---

## 10. 身份绑定

未绑定用户的消息 **fail-closed**（不进 Agent、不耗 token），只回绑定引导。

### 10.1 流程

```
Web 端「渠道管理 → 我的 QQ 机器人 → 绑定我的账号」
   → POST /api/ai/channels/:id/bind-code
     生成 6 位码，TTL 5 分钟；限流：同 user 5 次/小时
   → Modal 展示码 + 倒计时 + 文案「在 QQ 中向机器人发送 /绑定 482913」
   → 前端每 3 秒轮询绑定结果，最长 5 分钟
用户发 /绑定 482913
   → 校验 code（未过期/未消费/同渠道/同租户）
   → 写 ai_channel_identity → consumed_at
   → 回「绑定成功，现在可以直接对话了」
```

### 10.2 自动绑定（可选，默认关）

微信/QQ 这类渠道的 `external_user_id` 是平台 openid，无法预填。若用户觉得手动绑定麻烦，
可以提供「首次对话即绑定」开关（`autoBindFirstUser`），但**默认关闭**——否则任何人找到你的机器人就能用你的 Agent 额度。

### 10.3 出站目标解析（主动通知用）

`channel_send` 需要知道"发给谁"，顺序：

1. 工具参数显式 `to`（高级）
2. `ai_channel_identity` 中当前 `user_id` 在该渠道的绑定 → `external_chat_id`
3. 都解析不到 → **工具失败并明确告知**："该渠道尚未绑定你的账号，请先在 渠道管理 里绑定"

---

## 11. 入站管线

```
webhook:  POST /api/ai/channels/inbound/:channelId     （匿名，验签即认证）
长连接:   adapter.start({ sink: handleInbound })        （已在连接内）
                │
                ▼
          handleInbound(messages: InboundMessage[])     ← 两条路径汇合于此
                │
  ├─ 1. 幂等：INSERT ai_channel_message(direction='in', external_message_id)
  │        ON CONFLICT DO NOTHING；影响 0 行 → 丢弃（平台重投）
  ├─ 2. 群聊过滤：chatType='group' && !mentionsBot && requireMention → dropped
  ├─ 3. 身份解析：identity → userId；无 → 回绑定引导，结束
  ├─ 4. 命令解析：§11.4 命中 → 处理并回；未知斜杠命令 → 回"未知命令"，不送模型
  ├─ 5. session 解析：§11.3（含懒校验自愈）
  ├─ 6. 串行锁：同 session 已有 run → 回"正在处理上一条，发 /停止 可中断"
  ├─ 7. typing（若 adapter 支持）→ 开始
  ├─ 8. sessionService.appendMessage(user) + agentLoop.runStream({
  │        tenantId, userId, sessionId, message, toolRegistry })
  ├─ 9. 聚合 content chunk
  ├─ 10. outbound（分片）→ 发送
  ├─ 11. typing → 结束；更新 ai_channel_message.status / last_message_at
  └─ 12. 若 autoNotifyOnFinish → 触发通知子智能体（§14）
```

**为什么第 1 步在身份解析之前**：平台重投常发生在处理超时之后，此时身份早已绑定；先去重可避免"回了两遍绑定提示"。

### 11.1 webhook 层的额外约束

```
├─ 限流：按 channelId + IP 粗限流；body ≤ 1MB
├─ 载入 channel：enabled? 否则统一 404（不泄露存在性）
├─ adapter.verifyUrl? → URL 验证直接返回
└─ adapter.parse() → 验签失败 401，只写审计不写业务表
```

**必须先 ACK 再处理**的渠道（QQ webhook / 企微 5 秒）：
`parse()` 返回 `{ messages, ack }`，管线先把 `ack` 返回给平台，再用后台任务跑第 1 步之后的流程。

### 11.2 会话创建走统一入口

渠道**不直接调 `memory`**：

```ts
const { sessionId } = await sessionService.create({
  tenantId, userId, agentId: channel.agentId ?? defaultAgentId,
  origin: { kind: 'channel', channelId: channel.id, channelType: channel.type },
});
```

### 11.3 external key 规则

```
dm:     dm:{externalUserId}
group:  group:{externalChatId}:{externalUserId}   // per-user（默认）
    或  group:{externalChatId}                    // per-chat
mqtt:   mqtt:{deviceId}
```

### 11.4 命令集

| 命令 | 别名 | 行为 |
|---|---|---|
| `/新对话` | `/new` `/reset` | 新建 session 并重绑当前 externalKey → `已开启新对话（#a1b2c3）` |
| `/会话` | `/sessions` `/列表` | 最近 5 个 session：短 id + 标题 + 更新时间 |
| `/切换 <短id>` | `/switch` | 绑到历史 session（**必须校验属于本人**） |
| `/当前` | `/status` | 当前 session 短 id、标题、Agent、是否在跑 |
| `/停止` | `/stop` | abort 进行中的 run |
| `/绑定 <6位码>` | `/bind` | 绑定外部账号 |
| `/帮助` | `/help` `/?` | 命令列表 + 渠道名 |

**短 id** = sessionId 前 8 位。`/切换` 在同一 `userId` 范围内解析，重复则要求输入更多位。

### 11.5 生命周期与自愈

```
(externalKey 命中 ai_channel_session) ?
  ├─ 是 → sessionId
  │        └─ 懒校验：sessionService.get(sessionId) 存在？
  │              ├─ 存在 → 复用
  │              └─ 不存在（用户删了/清空回收站）→ 新建 + 改写映射（自愈）
  └─ 否 → 新建（§11.2）+ INSERT ai_channel_session(origin='inbound')
```

**不级联删除**：AI 侧删除会话是软删除到回收站，渠道模块不感知。
"懒校验 + 自愈"避免跨模块事件耦合，也天然支持"用户在 Web 删了会话后继续在 QQ 里聊"（自动开新会话）。

### 11.6 并发控制

1. 渠道侧：`Map<sessionId, AbortController>`；已在跑 → 回提示，**不排队**（IM 里排队体验差且成本不可控）。
2. 跨进程：`memory.withSessionMemoryLock(sessionId, scope, fn)`（已有）。
3. 渠道 run 的 abort 与 Web 侧解耦（断开 ≠ 停止，与 `chat.ts` 的 `activeRuns` 语义一致）。

---

## 12. 出站管线

```
发送请求（reply / notify / progress）
  ├─ 1. 分片：按 catalog.maxMessageLength，优先在段落/句子边界切
  ├─ 2. 限流：cache 令牌桶 ai:channel:rl:{channelId}
  │      └─ 超限 → next_retry_at = 窗口结束
  ├─ 3. 落 ai_channel_message(direction='out', status='queued')
  ├─ 4. adapter.send() → sent / failed(指数退避 1s→5s→30s→2m→10m，最多 5 次)
  └─ 5. runtime 每 5s 扫 outbox：
         SELECT ... WHERE direction='out' AND status IN ('queued','failed')
           AND next_retry_at <= now() ORDER BY next_retry_at LIMIT 20
           FOR UPDATE SKIP LOCKED        -- 多实例安全
```

**流式体验**

| 渠道 | 策略 |
|---|---|
| `weixin-ilink` | 不支持编辑 → 发 `typing:1`（体验上等同于"正在输入"），结束后发最终结果 |
| `feishu-app` | 支持编辑 → 可选先发"思考中…"，每 ≥1.5s `PATCH` 更新（`streamingReply=true` 时） |
| `qqbot` / `wecom-app` / `dingtalk-app` | 不支持编辑 → 只发最终结果；耗时 > 20s 先发"正在处理"（`replyProgressMessages` 控制） |
| `mqtt` | 只发最终结果 |

**默认 `streamingReply=false`**：编辑消息容易触发平台限流，且用户体验增益有限。

---

## 13. 会话级渠道通知与工具

### 13.1 开关存储（入库）

`sessions.settings.channel`（`ai_session_meta.settings` JSONB）：

```json
{ "notifyEnabled": true, "notifyChannelIds": [], "autoNotifyOnFinish": false }
```

读写走 `SessionService.getSettings / updateSettings`，`ai` 模块不关心渠道语义，渠道模块只写自己的 namespace。

### 13.2 工具注入点

```ts
// module.ts — AIModuleDeps 新增
extraTools?: (params: {
  tenantId: string; userId: string; sessionId?: string;
}) => Promise<ToolDefinition[]>;

// buildToolRegistry 改 async，末尾拼接
const extra = deps.extraTools ? await deps.extraTools({ tenantId, userId, sessionId }) : [];
for (const t of extra) if (!registry.get(t.name)) registry.register(t);
```

```ts
// chat.ts — 工厂返回值放宽
createTenantToolRegistry?: (
  tenantId: string, userId?: string, sessionId?: string,
) => ToolRegistry | Promise<ToolRegistry>;
```

**为什么必须 async**：工具是否出现取决于会话的 `notifyEnabled`（查 DB）。
若强行同步，只能"永远注册、handler 内拒绝"——模型会看到一个总报错的工具，白烧 token。
用户要求"**如果启用了，则在 tools 里加上**"，所以按开关动态注册。

**同时暴露** `AIModule.services.createToolRegistry = buildToolRegistry`，渠道侧 run 复用同一套租户工具。

### 13.3 `channel_list`

```
描述：列出当前用户已启用、可用于通知的对话渠道。需要把结果通知用户时先调用本工具。
参数：无
返回：[{ id, type, name, bound: true, targetHint: "私聊", healthy: true }]
```

### 13.4 `channel_send`

```
描述：把消息发送到用户的某个对话渠道。使用当前会话 ID 作为 threadKey 时，
     用户在渠道中的回复会接续当前这段对话（上下文完整），因此可以告知用户
     "在这里回复即可继续追问"。
参数：
  channel    string  必填  渠道 id 或 type（如 "qqbot"）
  message    string  必填  纯文本，≤ 4000 字
  threadKey  string  可选  默认 = 当前 sessionId
  title      string  可选  平台支持时作为消息头
返回：
  { sent: true, channel: "qqbot", target: "私聊", sessionId: "4795…", note: "用户回复将接续此会话" }
  { sent: false, reason: "该渠道尚未绑定你的账号" }
```

**执行步骤**

```
1. 读 session settings.channel.notifyEnabled === true?（否则 fail-closed）
2. 校验 channel 属于当前 tenant + user
3. 解析目标（§10.3）
4. 分片 → outbox 发送
5. 【枢纽】upsert ai_channel_session(
     channel_id, external_key=目标, session_id=threadKey ?? 当前, origin='notify',
     reply_context=<从 identity 或最近消息取> )
6. UPDATE ai_session_meta SET settings.channel.notifiedAt = now()
7. 写审计 + 返回结构化结果
```

**第 5 步是整套设计的枢纽**：

```
Web 会话 A（sessionId=4795…）
   │  Agent 调 channel_send(channel="qqbot", message="任务失败：…")
   ▼
QQ 私聊（external_key=dm:{openid}） ──绑定──► sessionId=4795…
   │
   │  用户回："失败在哪一步？"
   ▼
inbound → 同一 external_key → sessionId=4795…
   → agentLoop 带着完整上下文（含刚才那次任务的全部工具调用记录）回答
```

### 13.5 防重复与体验细节

- **同渠道回环**：目标 external key 恰是当前会话的来源 key → 返回 `{ sent:false, reason:"当前会话就在该渠道，直接回复即可" }`。
- **每轮上限**：同一 run 内 `channel_send` 最多 3 次（handler closure 计数）。
- **正文截断**：> 4000 字截断并附「完整内容见 Web 会话」。
- **敏感兜底**：服务端正则脱敏（`sk-`、`AKIA`、超长 base64、手机号/证件号）。

---

## 14. 自动推送：通知子智能体

> 待定 #5 的决定：**由子智能体把 AI 最后一次完整回复做总结后发送**，不是截断原文。

### 14.1 两个开关的分工

| 开关 | 触发者 | 语义 |
|---|---|---|
| 工具 `channel_send` | 模型自己决定 | "现在、按我说的内容、发到这个渠道" |
| `autoNotifyOnFinish` | 系统，每轮结束 | "不管模型有没有调工具，都把结果推给你" |

两者互补：前者精准，后者兜底。

### 14.2 子智能体实现（复用既有模式）

完全对齐 `module.ts:826` 的 `judgeToolCall` 与 `module.ts:1228` 的 `generateSessionTitle`：

```ts
async function summarizeForNotify(params: {
  agentId: string; tenantId: string; finalContent: string; channelName: string;
}): Promise<string | null> {
  const agent = await agentCrudService.getById(params.agentId, params.tenantId);
  const model = agent?.summaryModel ?? agent?.models?.[0];   // 不新增字段，复用摘要模型
  if (!model) return null;

  const result = await llmGateway.chat({
    model,
    tenantId: params.tenantId,
    thinkingLevel: 'off',      // 纯摘要，关思考避免推理模型耗尽预算返回空 content
    maxTokens: 512,
    messages: [
      { role: 'system', content: NOTIFY_SUMMARY_PROMPT },
      { role: 'user', content: params.finalContent },   // ← 最后一次完整回复原文
    ],
  });
  // 推理模型可能把预算耗在 reasoning 上导致 content 为空 → 回退
  const text = (result.content || result.reasoning || '').trim();
  return text ? text.slice(0, 800) : null;
}
```

`NOTIFY_SUMMARY_PROMPT`（要点）：

```
你是 IM 通知摘要生成器。把下面这段 AI 回复压缩成一条适合手机通知栏阅读的消息：
- 不超过 200 字，纯文本，不要 Markdown 标记
- 第一句给结论（成功 / 失败 / 需要你决定）
- 若失败，必须写明失败在哪一步
- 最后一句给用户下一步可以做什么（例如"回复即可继续追问"）
- 不要客套话，不要"以下是"之类的开场
只输出摘要本身。
```

**降级**：模型未配置 / 调用失败 / 返回空 → 直接取 `finalContent` 前 200 字 + `…（完整内容见 Web 会话）`。**通知不能因为摘要失败而丢失**。

### 14.3 触发位置

`createChatRoutes` 的流末尾已有 `generateSessionTitle` 的收尾逻辑（`chat.ts:1019`），并列加一个钩子：

```ts
onRunFinished?: (params: {
  sessionId: string; agentId: string; tenantId: string; userId: string;
  finalContent: string;              // 本轮最后一次完整 assistant 回复
}) => Promise<void>;
```

由 boot 层注入渠道模块的实现：

```
onRunFinished
  → 读 session settings.channel
  → notifyEnabled && autoNotifyOnFinish ?
      → 取 notifyChannelIds（空 = 全部已启用且已绑定）
      → summarizeForNotify(finalContent)
      → 对每个渠道 channel_send(kind='notify')
      → 更新 notifiedAt
```

**去重**：同一 session 同一 `runId` 只推一次（`ai_channel_message` 上加 `(session_id, kind, external_message_id)` 唯一约束，`external_message_id` 用 runId）。

**频率上限**：同一 session 每小时最多 3 次自动推送，避免长任务刷屏。

---

## 15. 运行时

### 15.1 连接管理

```ts
interface ChannelRuntime {
  boot(): Promise<void>;                 // 为所有 enabled 渠道按需拉起
  reload(channelId: string): Promise<void>;
  shutdown(): Promise<void>;             // 先摘流量再断开
  status(channelId: string): { connected: boolean; since?: number; detail?: string };
}
```

| transport | 行为 |
|---|---|
| `webhook` | 无常驻连接，`health()` 定时探活（5 分钟） |
| `long-conn` | `adapter.start()` + 指数退避重连（1s→2s→4s…≤60s） |
| `polling` | 长轮询循环（微信 35s）；超时视为正常，立即重连不退避；`-14` 暂停 1 小时 |

### 15.2 多实例

长连接同一 bot 不能多实例同时连（消息分裂）。用既有 `createDistributedLock(cache)`：

```
lockKey = ai:channel:conn:{channelId}
TTL 30s，持有者每 10s 续期；续期失败 → 释放并重新竞争
抢不到 → status='standby'
持有者崩溃 → TTL 到期 → 另一实例接管
```

webhook 类**不需要锁**（平台打到任意实例），但 `ai_channel_session` 的 upsert 必须幂等（唯一索引 + ON CONFLICT）。

### 15.3 优雅关闭

1. 停止接收（`adapter.stop()` / 停 outbox 扫描）；
2. 等运行中的 run 完成，最长 25s；
3. 释放分布式锁；
4. 未完成 outbox 保持 `queued`，下个实例接手。

---

## 16. 路由

**关键约束**：入站 webhook 匿名，不能挂在 `router.use(authMiddleware)` 下。
渠道模块**不调用全局 `router.use(authMiddleware)`**，逐路由注入（与 `chat.ts` 一致）。

### 16.1 匿名（验签即认证）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/ai/channels/inbound/:channelId` | 统一入站入口（URL 验证 + 消息推送共用） |

防护：channelId 存在且 enabled；body ≤ 1MB；IP + channelId 双限流；异常只回通用码。

### 16.2 鉴权（`ai:channel:use`，逐路由注入 authMiddleware）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/channels/catalog` | 渠道类型目录（含字段定义、默认值、引导），前端渲染表单 |
| GET | `/api/ai/channels` | 我的渠道列表（状态、`hasSecret`、webhook URL、群聊能力） |
| POST | `/api/ai/channels` | 新建 |
| PATCH | `/api/ai/channels/:id` | 更新（`secrets` 空值 = 不修改） |
| POST | `/api/ai/channels/:id/enable` | 启用（先 `prepare()` + `health()`，失败 400 带 `status_detail`） |
| POST | `/api/ai/channels/:id/disable` | 禁用（停连接；outbox 保留） |
| DELETE | `/api/ai/channels/:id` | 删除（级联 identity/session 映射；不删 AI session 本体） |
| POST | `/api/ai/channels/:id/test` | 发送测试消息 |
| POST | `/api/ai/channels/:id/health` | 主动探活 |
| GET | `/api/ai/channels/:id/identities` | 已绑定账号（脱敏） |
| POST | `/api/ai/channels/:id/bind-code` | 生成绑定码 |
| DELETE | `/api/ai/channels/:id/identities/:identityId` | 解绑 |
| GET | `/api/ai/channels/:id/messages` | 最近收发记录（脱敏摘要，分页） |

### 16.3 扫码登录（仅 `weixin-ilink`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/channels/:id/qr-login/begin` | 取二维码 → `{ qrcode, imgContent, expiresIn }` |
| GET | `/api/ai/channels/:id/qr-login/status` | 轮询状态；`confirmed` 时落库并自动启用 |
| POST | `/api/ai/channels/:id/qr-login/verify-code` | 提交验证码（`need_verifycode` 时） |

### 16.4 会话级

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/conversations/:id/channel-notify` | 读开关 + 通知台账 |
| PATCH | `/api/ai/conversations/:id/channel-notify` | `{ notifyEnabled, notifyChannelIds?, autoNotifyOnFinish? }` |

OpenAPI 描述要求：明确「owner 由认证上下文注入，不接受请求参数」；跨用户/跨租户一律 **404**（不返回 403，避免探测）。

---

## 17. 前端

### 17.1 渠道管理页 `/app/ai/channels`

```
┌──────────────────────────────────────────────────────────────────┐
│ 对话渠道                                    [+ 添加渠道]         │
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐        │
│ │ ● 微信         │ │ ○ 飞书         │ │ ○ QQ           │        │
│ │ 我的微信       │ │ 未配置         │ │ 未配置         │        │
│ │ 已绑定 1 个账号│ │                │ │                │        │
│ │ 近24h 12条     │ │                │ │                │        │
│ │ [配置][停用]   │ │ [配置][启用]   │ │ [配置][启用]   │        │
│ └────────────────┘ └────────────────┘ └────────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

- **空态**：说明「配置后可以在微信 / QQ / 飞书 / 钉钉 里直接和 AI 对话」+ 推荐卡片。
- **添加**：Drawer → 类型网格（按 `category`：即时通讯 / 办公 / IoT）→ 配置表单。
- **表单**：**由 `catalog.configFields` / `secretFields` 动态渲染**（AntD Form）。
  - `password` 已有值时 placeholder 显示 `••••••（已保存，留空则不修改）`。
  - 每个字段下方 `help` + `docsUrl` 链接。
  - 顶部折叠「配置步骤」（`catalog.setupGuide`）。
- **接入指引**（按 `transport`）：
  - `webhook`：展示回调 URL + 复制 + 「填到哪」说明。
  - `long-conn`：「无需公网，保存后自动连接」+ 状态灯。
  - `qr`（微信）：保存后自动弹二维码 Modal。
- **绑定**：`[绑定我的账号]` → Modal 展示 6 位码 + 倒计时 + 「在微信中向机器人发送 `/绑定 482913`」+ 轮询结果。
- **测试**：`[发送测试消息]`，inline 展示结果。

### 17.2 Chat 页会话设置

```
┌─ 渠道通知 ─────────────────────────────────┐
│ 允许 AI 把任务结果推送到你的聊天渠道        │
│                                    [ 开 ]  │
│                                            │
│ 可用渠道：                                 │
│  ☑ 我的微信（已绑定）                      │
│  ☐ 飞书（未绑定，去绑定）                  │
│                                            │
│ ☑ 每轮结束自动推送（由 AI 总结后发送）      │
│                                            │
│ 开启后，可以说"任务完成后给我发微信通知"   │
│ 你在微信里的回复会接续当前会话             │
└────────────────────────────────────────────┘
```

- 打开后输入框上方显示可复制的示例话术。
- 一个渠道都没配 → 开关置灰 + 「去配置渠道」。

### 17.3 会话列表渠道徽标

| origin_channel_type | Tag |
|---|---|
| 空 | （不显示，Web 来源） |
| `weixin-ilink` | `微信` |
| `qqbot` | `QQ` |
| `feishu-app` | `飞书` |
| `wecom-app` | `企微` |
| `dingtalk-app` | `钉钉` |
| `mqtt` | `IoT` |

加过滤下拉：`全部 / Web / 微信 / QQ / …`（`SessionService.list` 已带 origin）。

### 17.4 通知台账

会话信息面板显示「已通知到微信（14:32）、飞书（14:35）」，点击跳到对应渠道消息记录。

---

## 18. 模块装配

### 18.1 包结构

```
packages/platform/ai-channel/
├── src/
│   ├── types.ts
│   ├── catalog.ts              渠道目录：能力、字段、默认值、引导、文档链接
│   ├── adapters/
│   │   ├── index.ts            registry
│   │   ├── weixin-ilink/       client.ts / qr-login.ts / monitor.ts / send.ts / types.ts
│   │   ├── feishu-app.ts
│   │   ├── qqbot.ts
│   │   ├── wecom-app.ts
│   │   ├── dingtalk-app.ts
│   │   └── mqtt.ts
│   ├── crypto/
│   │   ├── wecom-aes.ts        WXBizMsgCrypt 兼容（AES-256-CBC + PKCS7）
│   │   └── signature.ts        sha1 / hmac-sha256 / ed25519
│   ├── models/channel.ts       5 张表读写（参数化 SQL）
│   ├── migrations/001_create_ai_channel_tables.ts
│   ├── services/
│   │   ├── channel.ts          CRUD + 凭证加解密 + 启停
│   │   ├── identity.ts         绑定码 / 身份解析
│   │   ├── session-link.ts     externalKey ↔ sessionId（懒校验自愈）
│   │   ├── inbound.ts          管线（§11）
│   │   ├── outbound.ts         分片/限流/outbox（§12）
│   │   ├── runtime.ts          连接生命周期 + 分布式锁（§15）
│   │   ├── notifier.ts         通知子智能体（§14）
│   │   └── tools.ts            channel_list / channel_send
│   ├── routes/{inbound,channel,qr-login,conversation}.ts
│   ├── module.ts
│   └── index.ts
└── tsconfig.json
```

依赖：`core` / `database` / `cache` / `events` / `observability` / `webhook` / `ai`。
**反向依赖禁止**：`@ventostack/ai` 不 import `ai-channel`，通过 `extraTools` + `services.createToolRegistry` / `services.sessionService` 单向连接。

### 18.2 boot 装配（两段式注入）

`createAIModule` 需要渠道的工具工厂，渠道模块又需要 AI 的 services —— 用可变引用打破循环，
不引入 DI 容器（符合 AGENTS.md "显式依赖注入、无容器"）：

```ts
const extraToolsRef: { current?: ExtraToolsFactory } = {};

// 1) 先建 AI，extraTools 用可变引用
const aiMod = await loadAIModule({
  ..., extraTools: (p) => extraToolsRef.current?.(p) ?? [],
});

// 2) 再建渠道，拿到其工厂
const channelMod = enabled.aiChannel
  ? await loadAiChannelModule({
      db, cache, eventBus, credentialEncryptor, storagePath,
      aiServices: aiMod.services,        // sessionService / agentLoop / memory / createToolRegistry
      publicBaseUrl: config.publicBaseUrl, // 拼 webhook URL
    })
  : undefined;

// 3) 回注
extraToolsRef.current = channelMod?.services.createTools;
```

其余：
- `moduleFlags.aiChannel`（默认 `ai === true` 时开启）
- `platform.router.merge(channelMod.router)`
- `init()`：`sessionService.backfill()` → `channelRuntime.boot()`
- shutdown：先 `channelRuntime.shutdown()`，再关 AI

### 18.3 迁移注册

```ts
// apps/admin/api/src/database/migrations.ts
import { createAiSessionMeta } from '@ventostack/ai';        // 020
import { createAiChannelTables } from '@ventostack/ai-channel';

runner.addMigration(createAiSessionMeta);
runner.addMigration(createAiChannelTables);
```

### 18.4 菜单种子

`apps/admin/api/src/database/seeds/014_ai_channel_menu.ts`（沿用 `007_ai_menus.ts` 写法）：

```
AI 对话渠道   /app/ai/channels   ApiOutlined   排序 3   perm ai:channel:use   类型 2
```

权限项：`ai:channel:use`。**不设 `ai:channel:manage`**（不做租户共享）。

---

## 19. 符合项目约定检查清单

> 回应："开发时要符合项目约定和既有框架"

### 19.1 AGENTS.md

| 约定 | 本设计的落实 |
|---|---|
| 无 class、函数式优先 | 全部用 `createXxx()` 工厂 + 闭包，零 class |
| 禁止 `any` | 用 `unknown` + 窄化；`config`/`secrets` 走显式类型守卫 |
| 公共 API 显式返回类型 | 所有 service 方法标注返回类型 |
| 文件 ≤ 300 行 | adapter 按职责拆分（`weixin-ilink/` 拆 4 个文件） |
| kebab-case 文件名 | `weixin-ilink.ts`、`session-link.ts` |
| 测试同目录 `.test.ts` | 每个 service/adapter 旁挂测试 |
| 参数化 SQL | 全部 `db.raw(sql, values)`，无拼接 |
| 租户隔离 | 所有查询强制 `tenant_id` + `user_id`；缺一即 404 |
| 外键约束优先 | `ON DELETE CASCADE` 到 channel |
| 错误类带 `code`/`status` | 复用 `ai/src/errors.ts` 的模式 |
| 默认脱敏字段 | token/secret/openid 全脱敏；`payload_preview` 截断 200 字 |
| 新增依赖必须说明 | §5.3 已逐个论证 |

### 19.2 框架既有设施（不重复造）

| 能力 | 复用 |
|---|---|
| 路由 | `createRouter()`、`routeDoc()`、`fail/success/handleError`、`parseBody` |
| 鉴权 | `authMiddleware` + `perm('ai:channel','use')` |
| 限流 | `rateLimit()`（`@ventostack/core`） |
| 租户 | `ctx.user.tenantId`（绝不信任 payload） |
| 缓存 | `Cache`（token/typing_ticket/令牌桶/分布式锁） |
| 事件 | `EventBus`（`ai.channel.*`） |
| 分布式锁 | `agent-engine/distributed-lock.ts` |
| 会话 | `SessionService`（新增，见 §4） |
| Agent 运行 | `agentLoop.runStream()`（不另造执行面） |
| 工具 | `ToolRegistry` + `extraTools` 注入 |
| 凭证加密 | `credentialEncryptor`（`AI_CREDENTIAL_ENCRYPTION_KEY`） |
| 审计 | `auditStore` |
| 长任务 | `longRunning()`（webhook 若需长处理） |

### 19.3 前端（`apps/admin/web/CLAUDE.md`）

| 约定 | 落实 |
|---|---|
| 禁止直接 `fetch` | 全走 `client` |
| 不手写分页 | `useTable<T>(fetcher)` |
| 操作列 `ActionColumn` + `fixed:'right'` | 渠道列表操作列 |
| `Modal` 用 `destroyOnHidden` | 二维码/绑定 Modal |
| 表格 `size="small"` / `rowKey="id"` | 全部 |
| 禁止内联 `style`（动态 token 除外） | 用 UnoCSS class + `theme.useToken()` |
| 不手改 `api/schema.ts` | 由 o2t 从 OpenAPI 重新生成 |
| 文件路由 | `pages/app/ai/channels/index.tsx` 自动注册 |

---

## 20. 安全基线

### 20.1 输入

- webhook body ≤ 1MB；文本 ≤ 8000 字，超出截断。
- `channelId` 必须存在且 enabled；不存在统一 404。
- MQTT topic 禁止 `#` / `+`。
- payload 解析后只读白名单字段，不 spread 进对象（防原型污染）。

### 20.2 认证授权

- **匿名入口唯一凭证是平台签名**；验签失败 401，不写业务表，只写审计。
- 防重放：时间戳窗口 ±5 分钟 + `msg_id` 唯一索引（跨实例天然去重）。
- 身份缺失 **fail-closed**：不进 Agent，不耗 token。
- 绑定码：6 位 / TTL 5 分钟 / 一次性 / 同 user 5 次/小时 / 同渠道同租户。
- 渠道归属：`user_id` 必须等于 `ctx.user.id`，否则 404。
- 入站的 tenant 从 `ai_channel` 反查，**绝不信任 payload**。

### 20.3 凭证

- `secrets` 走 `credentialEncryptor` 加密。
- 接口只返回 `hasSecret: boolean` + 掩码；`PATCH` 空值 = 不变。
- `runtime_state` 里的 `typingTicket` 也是敏感票据 → 返回前端时剔除。
- 日志/审计/`status_detail`/`error` 一律脱敏。

### 20.4 出站

- 平台 API 域名是**代码内常量白名单**（`ilinkai.weixin.qq.com`、`open.feishu.cn`、`bots.qq.com`、`qyapi.weixin.qq.com`、`api.dingtalk.com`），不允许用户配置任意 URL。
- 唯一例外：`mqtt` 的 broker（自托管），仅允许 `mqtts://`/`wss://`，`allowInsecure` 默认 false。
- 出站正文做敏感模式兜底脱敏。

### 20.5 提示注入与跨用户泄露

- 群聊只取「@ 之后」的文本，不把同群他人消息拼进上下文。
- 会话按 `per-user` 隔离（默认），禁止 A 的 session 复用到 B。
- `channel_send` 由模型生成内容，因此：工具描述约束不发凭证 + 服务端脱敏兜底 + 每轮 ≤3 次 + 全量审计。

### 20.6 资源与成本

- 入站：私聊 20 条/分，群聊 10 条/分（按 `channel+chat+user`）。
- 出站：按 `catalog.rateLimit`（企微 20/min、微信按平台限速、飞书 50/s）。
- outbox 单渠道积压 > 500 条 → 新消息 `dropped` + 指标告警（防雪崩）。
- 自动推送同 session ≤3 次/小时。

---

## 21. 可观测与审计

### 21.1 事件

| 事件 | payload（不含正文） |
|---|---|
| `ai.channel.inbound` | `{ channelId, type, externalKey, sessionId, ok }` |
| `ai.channel.outbound` | `{ channelId, type, sessionId, kind, status, attempts, durationMs }` |
| `ai.channel.bind` | `{ channelId, userId, externalUserIdMasked }` |
| `ai.channel.error` | `{ channelId, stage: verify\|parse\|send\|connect\|login, code }` |
| `ai.channel.connected` / `.disconnected` | `{ channelId, type, reason }` |
| `ai.channel.notified` | `{ channelId, sessionId, source: tool\|auto }` |

### 21.2 指标

`channel_inbound_total{type,status}`、`channel_outbound_total{type,status}`、
`channel_run_duration_ms{type}`、`channel_connection_state{channelId}`、
`channel_outbox_pending{channelId}`、`channel_dropped_total{reason}`。

`reason` 取值：`unbound` / `no_mention` / `rate_limited` / `verify_failed` / `group_unsupported` / `duplicate`。

### 21.3 审计

渠道创建/修改/启停/删除、身份绑定/解绑、`channel_send` 出站、验签失败、扫码登录。
**不记录**：消息正文全文（只 200 字脱敏预览）、任何凭证、完整 external id（掩码）。

### 21.4 状态灯

| status | 含义 | UI |
|---|---|---|
| `active` | 近 10 分钟有成功收发/探活通过 | 绿 |
| `degraded` | 能连上但出站有失败 | 黄 + `status_detail` |
| `error` | 连接失败/凭证失效（含微信 `-14`） | 红 + 「重新配置/重新扫码」 |
| `pending_login` | 扫码类渠道尚未登录 | 蓝 + 「去扫码」 |
| `standby` | 多实例中未持有连接 | 灰 |
| `inactive` | 未启用 | 灰 |

---

## 22. 实施切分

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M0 骨架** | `SessionService` + `ai_session_meta`（020）+ `ai-channel` 包 + 5 表迁移 + catalog + registry + **`mqtt` adapter** | 本地 mosquitto 里发一句话收到回复；session 入库；会话列表显示 `IoT` 徽标 |
| **M1 出站与工具** | outbound（分片/限流/outbox）+ `channel_list`/`channel_send` + `extraTools` 注入 + 会话级开关（前后端） | Web 会话开启开关后说"发到我的微信"，微信收到；未开启的会话里工具不存在 |
| **M2 反向闭环** | `session-link` 反向绑定 + inbound 管线 + 命令 + 身份绑定码 + 渠道管理页 | 微信/QQ 里回复接上同一 session；`/新对话` 生效 |
| **M3 核心渠道** | `weixin-ilink`（扫码/长轮询/typing/`-14`）+ `feishu-app`（长连接）+ `qqbot`（WS）+ `wecom-app`（AES + 20/min） | 四渠道可收发；凭证只进不出；群聊（飞书/QQ）正确过滤与回复 |
| **M4 补齐** | `dingtalk-app`（Stream）+ 群聊策略 + 通知子智能体（`autoNotifyOnFinish`） | 钉钉群 @ 可用；每轮结束自动推送摘要 |
| **M5 加固** | 分布式锁/故障切换/优雅关闭 + 安全回归 + 脱敏 + 指标 + 文档 | 双实例只一个建连；kill -9 后 30s 接管；安全用例全绿 |

**M0 用 MQTT 做载体**（而非 v1 设想的 WebChat）：无公网、无验签、无平台审核，
`docker compose up mosquitto` 即可端到端验证 SessionService + 管线 + 出站，是风险最低的起点。

**M1 先于 M2**：先让「Web → IM 通知」跑通（价值直观、风险低），再做「IM → Agent」（涉及匿名入口与身份体系，风险高）。

---

## 23. 测试计划

### 23.1 单元

- 验签：正确/错误签名、过期时间戳、缺字段（企微 sha1、飞书 sha256、QQ ed25519）。
- 企微 AES 解密：正常 / padding 错误 / 长度不足。
- iLink 消息归一化：`message_type=2` 过滤、`message_state≠2` 过滤、`group_id` 非空丢弃、取 `item_list` 文本。
- 分片：边界（等于上限）、超长、emoji、代码块。
- 令牌桶：窗口内超限 / 窗口后恢复。
- 命令解析：`/新对话`、`/绑定 123`、未知命令、全角斜杠、大小写。
- external key：per-user / per-chat / mqtt。

### 23.2 集成

- **幂等**：同一 `externalMessageId` 投 3 次 → 只处理 1 次、只回 1 条。
- **反向闭环**：Web → `channel_send` → 模拟 IM 回复 → 断言 `sessionId` 相同且历史含前文。
- **fail-closed**：未绑定用户 → 不产生 run、不耗 token、只回引导。
- **群聊**：未 @ → `dropped`（飞书必须验证这条，因为它推全量消息）；@ 且已绑定 → 正常；@ 但未绑定 → 引导。
- **隔离**：A 的渠道 B 看不到（404）；跨租户 inbound 不可能命中。
- **自愈**：删除 session 后 IM 继续发 → 自动新建并继续。
- **并发**：同 session Web + IM 同时发 → 只一个 run。
- **SessionService**：meta 写入失败时仍能建会话（可用性）；meta 缺失时 `get()` 懒修复。

### 23.3 安全

- 伪造签名 / 重放（同 msg_id、时间戳平移）必须 401。
- `PATCH` 不传 secrets → 原值保留。
- 响应快照里不出现 `secrets` / `typingTicket`。
- 日志断言：全流程跑一遍，grep 不到 token/secret 明文。
- SSRF：出站 URL 指向内网 → 被白名单拒绝。
- MQTT：配置 `#` → 保存时拒绝。

---

## 24. 风险与待定

### 24.1 已知风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 微信 iLink 需重新扫码（约 24h）、bot id 变化 | 用户需周期性扫码 | 状态灯 + `pending_login` + 到期前提醒（`autoRelogin`）；不做"永不过期"承诺 |
| iLink `-14` 暂停 1 小时 | 当日不可用 | 显式状态 + 停轮询 1 小时 + 不重试风暴 |
| iLink 协议由官方插件实现，文档明确"不构成完整服务端契约" | 协议可能变更 | adapter 隔离 + 契约测试 + 版本化 `channelVersion` |
| QQ 个人主体只能频道 | 个人开发者用不了群聊 | UI 明确提示；引导企业主体 |
| 企微 20 条/分钟 | 高峰延迟 | 令牌桶 + 队列 + 长消息合并 |
| 飞书推群内全量消息 | 未过滤会烧 token | parse 阶段硬过滤 + 集成测试 |
| 长连接多实例 | 消息分裂 | 分布式锁 + standby |
| 用户滥用免费额度 | 成本 | 限流 + 审计 + （P2）日配额 |

### 24.2 已定（本轮确认）

1. 不做多 Agent 路由 —— 一个渠道绑一个 Agent。
2. 不做租户共享 —— 表已去掉 `owner_scope`，只有 `user_id`。
3. 富媒体留 v2 —— 平台已有 OSS，接口预留 `item_list` 透传。
4. 不做 WebChat / 公众号 / 微信客服 / 纯出站群机器人 / 境外渠道 / 邮件短信。
5. 自动推送由**子智能体**总结最后一次完整回复后发送（§14）。
6. 群聊支持（飞书 / QQ / 钉钉），默认 per-user 隔离 + 必须 @。

### 24.3 剩余待定

1. `/切换` 的短 id 长度：8 位前缀在单用户几十会话下几乎不冲突，待实测。
2. 微信重新扫码的提醒方式（站内通知 / 邮件 / 另一个渠道）——倾向复用 `notification` 模块发站内信。
3. `autoNotifyOnFinish` 的摘要模型：复用 `agent.summaryModel`（不新增字段），若不满意再考虑独立配置。

---

## 25. 改动清单

| 文件 | 改动 | 影响 |
|---|---|---|
| `packages/framework/ai/src/session-service.ts` | **新增** `SessionService` | 新文件 |
| `packages/framework/ai/src/migrations/020_create_ai_session_meta.ts` | **新增** | 新文件 |
| `packages/framework/ai/src/module.ts` | `conversationService` 改为 `SessionService` 适配；`extraTools`；`buildToolRegistry` 改 async；`services.sessionService` / `services.createToolRegistry` 暴露；`onRunFinished` 钩子 | 中 |
| `packages/framework/ai/src/routes/chat.ts` | `createTenantToolRegistry` 返回类型放宽 + 2 处 `await`；`onRunFinished` 调用 | 小 |
| `packages/platform/ai-channel/**` | **新增**整个包 | 新 |
| `packages/platform/boot/src/create-platform.ts` | `moduleFlags.aiChannel`；两段式装配；router merge；init/shutdown 钩子；`publicBaseUrl` 配置 | 中 |
| `apps/admin/api/src/database/migrations.ts` | 注册 `createAiSessionMeta` + `createAiChannelTables` | 一行 |
| `apps/admin/api/src/database/seeds/014_ai_channel_menu.ts` | **新增**菜单 + 权限 | 新 |
| `apps/admin/web/src/pages/app/ai/channels/*` | **新增**页面 | 新 |
| `apps/admin/web/src/pages/app/ai/chat/[agentId]/index.tsx` | 会话设置加渠道通知 | 小 |
| `apps/admin/web/src/pages/app/ai/chat/components/ThreadList.tsx` | origin 徽标 + 过滤 | 小 |
| `apps/admin/web/src/api/schema.ts` | o2t 重新生成（勿手改） | 自动 |

---

## 附：一次完整交互

```
1. 用户在 Web 与 Agent 排查部署失败（sessionId = 4795b31f…）
2. 开启「渠道通知 + 每轮结束自动推送」
3. Agent 查明原因，回复完整分析
4. 流结束 → onRunFinished
     → 通知子智能体把"最后一次完整回复"压成 200 字摘要
     → channel_send(kind='notify', channel='weixin',
                    message="部署失败：镜像拉取超时（步骤 3/7）。回复即可继续排查。",
                    threadKey="4795b31f…")
     → upsert ai_channel_session(dm:{openid} → 4795b31f…, origin='notify')
     → iLink sendmessage（回传 context_token）
5. 用户微信收到消息，回复："失败在哪一步？"
6. inbound（长轮询）→ 归一化 → 幂等 → 身份解析 → external_key 命中 4795b31f…
     → agentLoop.runStream 带完整上下文（含第 3 步的工具调用记录）
7. Agent："第 3 步 registry 返回 504，建议改镜像源……"
8. 用户继续问 → 同一 session
9. 回 Web 打开同一条会话，看到微信里的两轮对话都在（同一 jsonl）
10. 想换话题：微信里发 /新对话 → 新 session；旧会话仍可 /切换 找回
```

**核心：渠道不是第二套会话体系，而是同一个 session 的另一个 I/O 入口。**
