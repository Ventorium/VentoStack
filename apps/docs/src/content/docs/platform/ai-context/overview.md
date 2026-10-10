---
title: AI 上下文洞察概述
description: '@ventostack/ai-context 订阅 AI 模块事件流，把每一次模型请求装配出的上下文（系统提示 / 工具 schema / 消息面各分桶）实时落库，并提供概览、趋势、上下文浏览器、事件、文件活动的租户隔离查询 API 与管理后台页面。'
---

## 概述

`@ventostack/ai-context` 是 VentoStack 平台层的 **AI 上下文洞察** 模块。它订阅框架 AI 模块（`@ventostack/ai`）的全局事件发射器，把 Agent 每一次模型请求「实际带上了什么」记录下来。

它回答的不是「调用链路怎么走的」，而是：

- 上下文窗口被**什么占满了**？（系统提示 / 工具 schema / 各类消息各占多少）
- 上下文**什么时候涨的、什么时候被压下去的**、压掉的是什么？
- 某一次请求**那一刻**装配进模型的完整上下文是什么？

> 本模块替代早期的 `@ventostack/ai-trace`（链路追踪）。新模块在原会话/消息记录基础上扩展出请求级上下文快照、变更事件与上下文重建能力。

## 架构关系

```
apps/admin/web  AI 对话页的「上下文」页签（仅管理员）
        │  GET /api/ai/context/*
        ▼
@ventostack/ai-context  (routes + queries + store + recorder + fold)
        │  订阅 AgentEventEmitter        读 ai_agent.context_collection_enabled（开关）
        ▼                                 ▼
@ventostack/ai  (agent loop 事件流)    ai_agent 表
        │
        ▼
ai_context_session / _request / _event / _node / _file_op
        （五张表，tenant_id 强制隔离）
```

## 数据模型

| 表 | 含义 |
|---|---|
| `ai_context_session` | 会话画像：跨 run 聚合的计数、**当前活跃上下文构成**、累计真实用量 |
| `ai_context_request` | 每一次模型请求的上下文快照（七分桶 + provider 上报的真实用量） |
| `ai_context_event` | 上下文变更事件：`inject`（注入）/ `compact`（压缩）/ `prune`（裁剪）/ `switch`（模型切换） |
| `ai_context_node` | 上下文组成元素（上下文浏览器的数据源）。**压缩不删行**，只打 `gone_at_seq` 进归档 |
| `ai_context_file_op` | 文件操作（read / write / search） |

## 事件 → 折叠 映射

折叠器（`services/fold.ts`）把事件流折叠成「当前活跃上下文 + 每次请求的装配快照」：

| 事件 | 动作 |
|---|---|
| `agent_start` | upsert 会话（跨 run 累加 `run_count`），初始化折叠状态 |
| `context` | 系统提示写入 `systemTokens` 信封（**不进消息面**，避免双算）；首轮用户消息进入活跃面 |
| `turn_start` | `turnIndex` 递增 |
| `before_provider_request` | **在本次响应进入活跃面之前**拍下请求快照（七分桶 + 合计） |
| `message_end` | 消息进入活跃面并按角色分类；assistant 响应同时累计真实用量与回复计数 |
| `tools_added` | 工具 schema 变更 → `inject` 事件 |
| `abort` | 压缩：把最旧的存活节点移出活跃面并打 `gone_at_seq` 归档，产生 `compact` 事件（净释放为负数） |
| `agent_end` / `error` | 关闭会话并落终态 |

## 上下文重建规则

有了活跃面（`nodes`）与归档（`archive`）两份数据，浏览器可以重建**任意一次请求**时刻的组装上下文：

```
节点在请求 R 时存活 ⟺ node.seq < R.seq && (node.goneAtSeq IS NULL OR node.goneAtSeq > R.seq)
```

## 七个上下文分桶

| 分桶 | 含义 |
|---|---|
| `system` | 系统提示词（信封标量，不进消息面） |
| `tools` | 工具 schema 总价（信封标量） |
| `user` | 用户消息 |
| `inject` | 注入上下文（如环境信息、文件片段） |
| `skill` | 技能内容（工具结果中出现 `<skill_content name="…">` 时从 `tool` 重分类而来） |
| `assistant` | 助手回复 |
| `tool` | 工具结果 |

## 关于 token 估算

分桶 token 是**启发式估算**：`ceil(字符数 ÷ 4) + 4`。中英文一视同仁，不做分词。它只用于看清**构成占比**，不用于计费。

真实用量单独存放于 `ai_context_request.act_*` 与 `ai_context_session.usage_*`，来自 provider 上报。两者在界面上分开展示，**不混合计算**。

> 当前 `@ventostack/ai` 的 `AgentEventMessage.usage` 只上报 `promptTokens` / `completionTokens`，不区分缓存命中与写入。因此缓存命中率在没有缓存数据时返回 `null`（界面显示 `-`），**不会伪造 0%**。成本同理返回 `null`，待接入价格表后再算。

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/context/overview` | 概览：KPI、构成、每日账目（`?days=1..365`） |
| GET | `/api/ai/context/sessions` | 会话列表（分页 + 关键字/Agent/用户/时间筛选 + 排序） |
| GET | `/api/ai/context/sessions/:sessionId` | 会话详情：请求序列 / 事件 / 活跃面 / 归档 / 文件操作 |

### 可见性：仅超级管理员

上下文记录包含**系统提示词、工具 schema、逐条消息预览**，属调试信息，因此：

- 后端：三个端点统一走 `requireAdmin()` 门禁，要求 `roles` 含 `admin`，非管理员一律 **403**。
  该门禁**刻意不使用** `createPermMiddleware` —— 那个中间件对 `admin` 是「超管跳过检查」的放行语义，
  方向与「只有 admin 能访问」相反。
- 前端：AI 对话页的「上下文」页签仅在 `useAuth().user.roles.includes('admin')` 时渲染。

`userId` 为可选筛选参数：缺省统计**租户内全部用户**，显式传入时只统计该用户。
`ai_context_request` 不冗余 `user_id`，按用户收窄时按天账目会回关联 `ai_context_session`。

## 租户语义

- 租户由**当前认证上下文**确定，客户端无需且不得传入 `tenantId`。
- 五张表的 `tenant_id` 均为 `NOT NULL`，且所有查询显式携带 `tenant_id = ?`。
- 跨租户访问按 **404** 处理（不区分「不存在」与「无权限」，避免泄露资源是否存在）。
- 无法解析租户时 fail-closed：401（未认证）/ 403（缺失租户归属），不退化为默认租户。

## 采集开关（按 Agent）

采集开关是 **`ai_agent.context_collection_enabled`**，布尔列，**默认 `FALSE`**，通过 Agent 详情接口读写：

```
PUT /api/ai/agents/:id   { "contextCollectionEnabled": true }
```

- **默认关闭**：上下文内容属敏感调试数据，未显式开启的 Agent 一律不落库。
- 读取失败或 `tenantId` / `agentId` 缺失时一律按「不采集」处理（fail-closed）——漏采只是少一条调试数据，
  误采会把本不该落库的内容写进库。
- 界面入口：**AI 智能 → Agent 管理 → 编辑弹窗 → 上下文采集**，而非独立的菜单页。
- 早期的全局配置键 `ai_context_enabled` 与 `/api/ai/context/config` 接口已随迁移 `021` / `022` 一并移除。

## 启用

```ts
// apps/admin/api/src/app.ts
modules: {
  ai: true,
  aiContext: true, // 缺省跟随 ai 开关
}
```

`@ventostack/ai-context` 是可选依赖（optionalDependencies），未安装时会给出明确报错提示。