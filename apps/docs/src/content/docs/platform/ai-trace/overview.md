---
title: AI 链路追踪概述
description: '@ventostack/ai-trace 订阅 AI 模块事件流，将 agent 会话的完整调用链（LLM 每轮 prompt/响应/耗时、工具执行、MCP 调用、知识库检索）实时落库，并提供租户隔离的查询 API 与管理后台页面。'
---

## 概述

`@ventostack/ai-trace` 是 VentoStack 平台层的 AI 链路追踪模块。它订阅框架 AI 模块（`@ventostack/ai`）的全局事件发射器，将每一次 agent 运行的完整调用链实时写入数据库：

- **Trace 级**（一次 agent 运行 = 一条 `ai_trace`）：用户消息、system prompt、模型、累计 usage、轮数/工具数、状态、耗时
- **Span 级**（运行中的每一步 = 一条 `ai_trace_span`）：LLM 每轮调用的增量 prompt/响应/stopReason/usage/provider、每次工具执行的参数/结果/分类（内置工具 / 知识库 / MCP）

## 架构关系

```
apps/admin/web  链路追踪页面
        │  GET /api/ai/trace/*
        ▼
@ventostack/ai-trace  (routes + trace-store + recorder + config)
        │  订阅 AgentEventEmitter          读写 sys_config（开关）
        ▼                                   ▼
@ventostack/ai  (agent loop 事件流)    @ventostack/system  (ConfigService)
        │
        ▼
ai_trace / ai_trace_span 表（tenant_id 强制隔离）
```

## 事件 → Span 映射

框架 agent loop 的事件按 `event.run.runId` 路由到对应运行缓冲：

| 事件 | 动作 |
|---|---|
| `agent_start` | 读开关；开启则插入 `ai_trace`（status=running），记录 meta（model/skillIds/knowledgeBaseIds/mcpServerIds/toolNames 等） |
| `context` | 回写 systemPrompt；首轮增量消息 = 用户消息 |
| `turn_start` | turnIndex 递增 |
| `before_provider_request` | 插入 LLM span（running），input = 本轮新增消息（增量策略） |
| `message_end`（assistant） | 关闭 LLM span：output = {content, stopReason, usage, model, provider, toolCalls}；累计 usage |
| `message_end`（tool） | 工具结果消息进入下一轮增量队列 |
| `tool_execution_start` / `end` | 插入/关闭工具 span；按工具名前缀分类（`kb-*` → 知识库，`mcp_{server}_*` → MCP，其余 → 内置） |
| `tools_added` | `jsonb_set` 追加 meta.toolNames |
| `agent_end` / `abort` / `error` / `settled` | finalize：status / usage / 轮数 / 工具数 / 耗时 / 回复摘要（前 200 字） |

### 增量 prompt 策略

为避免 prompt 随轮数平方级膨胀：

- **trace 级**保存完整 system prompt（含注入的 skills / 知识库引导）与用户消息
- **每个 LLM span** 只保存本轮新增消息：首轮为用户消息，后续轮为上一轮 assistant 输出 + 工具结果

### 落库安全

所有 payload 写入前统一经过：

1. `sanitize()`（`@ventostack/observability`）— 按 key 脱敏（password/token/secret/key/authorization 等）
2. `truncateJson()` — 单字符串截断 8000 字符、嵌套深度限制 6 层

## 表结构

### ai_trace

| 列 | 说明 |
|---|---|
| `id` | = runId |
| `conversation_id` | = sessionId |
| `agent_id` / `user_id` / `tenant_id` | 归属（tenant_id 参与所有查询索引） |
| `status` | running / success / error / aborted / interrupted |
| `user_message` / `assistant_preview` | 本轮输入与回复摘要（200 字） |
| `system_prompt` | 完整 system prompt |
| `meta` | JSONB：skillIds / knowledgeBaseIds / mcpServerIds / toolNames / maxIterations / researchMode |
| `usage` | JSONB：累计 {promptTokens, completionTokens, totalTokens} |
| `turn_count` / `tool_count` / `duration_ms` | 指标 |

索引：`(tenant_id, conversation_id, started_at DESC)`、`(tenant_id, started_at DESC)`

### ai_trace_span

| 列 | 说明 |
|---|---|
| `trace_id` + `tenant_id` | 归属 |
| `seq` | run 内全局自增序号 |
| `turn_index` | 所属轮次 |
| `span_type` | llm / tool |
| `name` | 模型名或工具名 |
| `category` | llm / knowledge_base / mcp / builtin |
| `input` / `output` | JSONB（llm：增量消息/响应；tool：args/result） |

索引：`(trace_id, seq)`

## API

所有端点要求 JWT 认证，`tenantId` 一律取自已验证用户（不信任查询参数），跨租户访问返回 404/空。

| Method/Path | 权限 | 说明 |
|---|---|---|
| GET `/api/ai/trace/conversations` | `ai:trace:list` | 会话级聚合列表（filters：agentId/userId/keyword/startTime/endTime + 分页） |
| GET `/api/ai/trace/conversations/:id` | `ai:trace:list` | 会话消息时间线（用户消息 + 助手回复摘要 + 指标） |
| GET `/api/ai/trace/traces/:traceId` | `ai:trace:list` | trace 详情 + 全部 spans（按 seq） |
| GET `/api/ai/trace/config` | `ai:trace:list` | 查询追踪开关 |
| PUT `/api/ai/trace/config` | `ai:trace:config` | 设置追踪开关（`{ enabled: boolean }`） |

## 开关与权限

- 开关存于 `sys_config`，key = `ai_trace_enabled`（'true'/'false'），**默认开启**（默认可审计）；读取走配置缓存，修改即时生效
- 关闭后新对话不再落库，已有记录保留可查
- 菜单：AI 管理 → 链路追踪（`/app/ai/trace`）；按钮权限「追踪开关配置」= `ai:trace:config`

## 陈旧运行兜底

进程崩溃等原因可能留下 `status='running'` 的僵尸记录。模块 `init()` 时及每 5 分钟执行 `markStaleTraces(1h)`：超过 1 小时仍为 running 的 trace 标记为 `interrupted`。

## 使用

`createPlatform()` 中跟随 `ai` 开关启用：

```typescript
const platform = await createPlatform({
  /* ... */
  modules: {
    ai: true,
    aiTrace: true, // 缺省跟随 ai 开关
  },
  aiConfig: { /* 必填当 ai=true */ },
});
```

## 已知限制

- **深度研究子任务不可见**：`runResearchSubtask` 不经过全局事件发射器，其内部步骤本期无法追踪，仅在 trace meta 中标记 `researchMode: true`
- **payload 截断**：单字符串 8000 字符 / 深度 6 层，超长 prompt/工具结果会被截断（标记 `...[截断]`）
- **敏感字段脱敏**：脱敏发生在落库前，已落库数据不可恢复原文
