# @ventostack/ai

## Agent 虚拟环境

Agent 可开启 `requiresVirtualEnvironment`（创建/编辑均可）。开启时只校验“在线宿主 + 用户资源上限”，
真正创建发生在该用户首次发消息时，并按 `(tenant_id, user_id, agent_id)` 唯一复用：

- 同一用户同一 Agent 的所有会话共享一台持久 Linux 虚拟机；
- 会话目录：`/workspace/{session_id}/knowledges`（只读知识库）、`/workspace/{session_id}/memories`（只读会话记忆）；
- 全局记忆：`/root/.vento-agent/memories`（双向同步到用户长期记忆）；
- Agent 使用 `terminal` / `file_read` / `file_write`，不再注册任何 `kb-*` 工具；
- `/workspace` 重要文件增量备份，释放/重建后可恢复。

宿主机由平台管理员在「AI 能力 / 虚拟机接入」统一接入；也兼容旧环境变量：

```dotenv
VENTO_RUNTIME_URL=http://192.168.8.210:8088
VENTO_RUNTIME_TOKEN=<runtime bearer token>
VENTO_RUNTIME_TIMEOUT_MS=30000
```

Runtime 不可用不会阻止 Fullstack 启动；普通 Agent 继续工作，虚拟机 Agent 返回明确的 503/409 错误。
完整设计见 `docs/designs/ai-agent-virtual-environment.md`。

AI 集成：LLM 接入、RAG、Tool Registry、权限沙箱。

## 模块定位

AI 能力层，依赖 core、auth、observability。提供 AI 工具注册、审批流集成和沙箱隔离执行。

## 核心能力

- 多 Provider、多 Model 注册和动态路由（21 个内置预设 + models.dev 动态模型拉取）
- OpenAI-compatible、Anthropic、Google、OpenAI Responses Provider（支持每次请求动态解析 API Key）
- Agent Loop：`beforeToolCall` / `afterToolCall` / `transformContext` / `prepareNextTurn` / `getApiKey` 钩子
- 动态工具引入（工具结果声明 `addedToolNames`，运行时注册供后续轮次使用）
- Session fork：从任意历史消息分叉出独立新会话（开启新的对话分支）
- MCP Server（stdio / HTTP，动态工具发现、命令与主机白名单、连接池上限 + 空闲回收）
- AI Telemetry：注入 `@ventostack/observability` 的 Tracer 后自动埋 `ai.run` / `ai.turn` / `ai.tool` span
- 对话、Agent Loop、流式输出和上下文压缩
- RAG、知识库、文档加载和租户隔离查询
- Tool Registry、风险策略和人工审批
- Skill（SKILL.md 递归加载 + 根目录 .md + ignore 文件）、Prompt Template、Memory 和会话存储
- 进程/Docker 沙箱、调用限流和 Token 预算

## Agent Loop 钩子（对齐 pi-agent-core）

```typescript
createAgentLoop({
  llmGateway,
  // 每次 LLM 请求前变换上下文（上下文裁剪 / 外部上下文注入）
  transformContext: async (messages, signal) => prune(messages),
  // turn 结束后替换下一轮 model / systemPrompt（模型切换 / 降级）
  prepareNextTurn: async ({ message, toolResults }) => ({ model: "fallback-model" }),
  // 每次请求动态解析 API Key（短期 OAuth token 等）
  getApiKey: async (provider) => await credentialStore.get(provider),
  // 工具结果声明 addedToolNames 时解析并注册动态工具
  dynamicToolResolver: async (name, tenantId) => registry.get(name),
  // 分布式追踪：提供 Tracer 后自动埋 ai.run / ai.turn / ai.tool span
  tracer,
  parentSpanContext: { traceId, spanId },
});

// 会话分叉：从历史消息开启独立新对话
const fork = await session.fork(
  { filePath: "fork.jsonl", sessionId: "fork-1" },
  { entryId: msgId, position: "before", scope: "branch" },
);
// HTTP: POST /api/ai/conversations/:id/fork  body: { entryId?, position?, scope? }  → { sessionId }
```

## 安全特性

### 沙箱安全默认

`createSandbox(permissions)` 的所有权限默认关闭：

| 权限 | 默认值 | 说明 |
|------|--------|------|
| `allowedTools` | `[]` | 空白名单 = 拒绝所有工具 |
| `allowFileRead` | `false` | 禁止文件读取 |
| `allowFileWrite` | `false` | 禁止文件写入 |
| `allowNetworkAccess` | `false` | 禁止网络访问 |
| `maxExecutionTime` | `60_000` (60s) | 超时自动终止 |
| `maxMemory` | `50MB` | 内存增量超限告警 |

```typescript
const sandbox = createSandbox({
  allowedTools: ["read_database"],  // 必须显式列出
  allowedHosts: ["api.example.com"], // 开启网络时必须提供
  workingDirectory: "/workspace",   // 开启文件访问时必须提供
});
```

### 工具白名单强制

- `allowedTools` 为空或 undefined 时，`canExecute()` 返回 `false`
- 必须显式配置白名单才能执行任何工具
- 未注册的工具名称自动拒绝

### 网络访问控制

- `allowNetworkAccess` 默认 false
- 开启时必须提供 `allowedHosts` 列表，空列表等同于禁止
- 仅允许 http/https 协议

### 文件路径限制

- 开启文件访问时必须提供 `workingDirectory`
- 使用 `resolve()` + 前缀校验防止路径遍历
- 仅允许 `workingDirectory` 及其子目录内的路径

### 超时与内存监控

- `wrapExecution()` 使用 `Promise.race` 实现超时控制
- 执行前后对比 `process.memoryUsage()`，增量超限时输出警告
- Worker 级别的 `resourceLimits` 强制隔离需在 Tool Registry 集成

## 编码约束

- 所有 Tool 输入必须做 Schema 校验
- 敏感操作必须经过审批流，禁止 AI 自批准
- 每次 Tool 调用必须有审计记录
