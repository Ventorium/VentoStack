---
order: 1
title: AI 工具与上下文管理
description: 使用 createToolRegistry、createSandbox、createApprovalManager 管理 AI 工具执行
---

`@ventostack/ai` 提供了 AI 应用开发的基础设施，包括工具注册与执行、权限沙箱、审批流和对话上下文管理。它不直接封装 LLM 提供商 API，而是专注于 AI 工具的安全调用与生命周期管理。

## 工具注册表

`createToolRegistry()` 创建工具注册表，负责工具的注册、参数校验、超时执行和 JSON Schema 导出：

```typescript
import { createToolRegistry } from "@ventostack/ai";

const registry = createToolRegistry();

// 注册工具
registry.register({
  name: "get_weather",
  description: "获取指定城市的当前天气",
  parameters: [
    { name: "city", type: "string", description: "城市名称", required: true },
    { name: "unit", type: "string", description: "温度单位", required: false },
  ],
  handler: async (params) => {
    const { city, unit = "celsius" } = params;
    // 调用天气 API
    return { city, temperature: 25, unit };
  },
  requiresApproval: false,
  riskLevel: "low",
  timeout: 10_000,
});

// 列出所有工具
const tools = registry.list();

// 校验参数
const validation = registry.validateParams("get_weather", { city: "北京" });
if (!validation.valid) {
  console.error(validation.errors);
}

// 执行工具
const result = await registry.execute("get_weather", { city: "北京", unit: "celsius" });
console.log(result.success, result.result, result.duration);

// 导出 JSON Schema（用于 Function Calling）
const schemas = registry.toJSONSchema();
```

## 权限沙箱

`createSandbox()` 创建权限沙箱，控制工具执行、网络访问和文件访问权限：

```typescript
import { createSandbox } from "@ventostack/ai";

const sandbox = createSandbox({
  allowedTools: ["get_weather", "search_document"], // 允许执行的工具名称列表，为空或不设置时拒绝所有工具（必须显式配置白名单）
  allowedHosts: ["api.weather.com", "api.example.com"],
  allowNetworkAccess: true,
  allowFileRead: true,
  allowFileWrite: false,
  workingDirectory: "/app/data",
  maxExecutionTime: 30_000,
  maxMemory: 100 * 1024 * 1024,
});

// 检查权限
if (sandbox.canExecute("get_weather")) {
  // 允许执行
}

if (sandbox.canAccessURL("https://api.weather.com/v1/current")) {
  // 允许访问该 URL
}

if (sandbox.canAccessPath("/app/data/config.json", "read")) {
  // 允许读取该文件
}

// 包装执行（带超时控制）
const result = await sandbox.wrapExecution("get_weather", async () => {
  return await fetchWeather();
});
```

> **安全默认**：`allowedTools` 为空数组或未设置时，`canExecute()` 对所有工具返回 false。必须显式配置白名单才能允许工具执行。

## 审批流

`createApprovalManager()` 创建审批管理器，用于敏感工具调用的人工审批：

```typescript
import { createApprovalManager } from "@ventostack/ai";

const approval = createApprovalManager({
  defaultTTL: 3_600_000, // 默认有效期 1 小时
  onRequest: (req) => {
    console.log(`新审批请求: ${req.toolName} (${req.id})`);
  },
  onReview: (req) => {
    console.log(`审批完成: ${req.status}`);
  },
});

// 提交审批请求
const request = await approval.request(
  "delete_database",
  { table: "users", where: "id = '123'" },
  "system",
);

// 查询待审批列表
const pending = approval.listPending();

// 批准请求（如果请求不存在或已处理，返回 null）
const approved = approval.approve(request.id, "admin", "确认执行删除操作");
if (!approved) {
  console.error("审批请求不存在或已过期");
}

// 拒绝请求（如果请求不存在或已处理，返回 null）
const rejected = approval.reject(request.id, "admin", "风险过高，拒绝执行");
if (!rejected) {
  console.error("审批请求不存在或已过期");
}

// 获取状态（不存在返回 null）
const status = approval.getStatus(request.id);
if (!status) {
  console.error("审批请求不存在");
}

// 清理过期请求
const cleaned = approval.cleanup();
```

### 持久化审批服务（数据库版）

平台装配使用基于 `ai_approval_request` 表的持久化审批服务（`createApprovalService`），语义与内存版不同：

| 行为 | 说明 |
|------|------|
| 待审批有效期 | 请求创建后 **24 小时**内未处理自动过期 |
| 批准后使用窗口 | 批准时刻起算 **10 分钟**，窗口内同用户同工具同参数（canonical JSON 比对）的重试直接放行 |
| 过期不可批 | 已过期的 pending 请求无法被批准或拒绝（原子 UPDATE 保证并发安全），返回 null |
| 禁止自批 | 发起人不能批准/拒绝自己发起的请求 |
| 参数一致性 | 重试放行要求参数完全一致；参数不同必须重新发起审批 |

> 审批事件通过事件总线广播：`ai.approval.requested` / `ai.approval.approved` / `ai.approval.rejected`。如需通知管理员，请订阅 `ai.approval.requested` 并接入 notification 模块。

## 工具执行安全策略

Agent Loop 对注册表工具执行默认拒绝策略：

```typescript
// 可用工具 = Agent 配置白名单 ∩ 请求过滤器
// Agent 未配置白名单时不暴露任何注册表工具；请求体无法单独扩权
agentConfig.tools = ["calculator", "kb-search"];

// 绑定知识库时自动追加 kb-* 只读检索工具
agentConfig.knowledgeBaseIds = ["kb-1"];
```

安全基线：

- **Agent 必须存在**：配置了 `agentService` 时，`agentId` 查不到配置会以 `AGENT_NOT_FOUND` 错误终止，不再降级为通用助手。
- **文件工具租户隔离**：`file-read` / `file-write` 仅允许访问 `<storagePath>/tenants/<tenantId>/` 目录。
- **web-fetch 内网防护**：默认拒绝 localhost、私网 IPv4/IPv6、链路本地（含云元数据地址）等目标 URL；可通过 `createWebFetchTool({ readerBaseUrl, allowPrivateHosts })` 指向自建 Reader 或显式放开。
- **terminal 白名单**：仅允许只读命令白名单，禁用全部 shell 结构字符（管道/分号/重定向/命令替换）与 `find -delete/-exec` 类写副作用旗标。
- **sql-query 租户列防护**：拒绝把表达式别名为 `tenant_id` 输出列的查询（防止外层租户过滤被派生表遮蔽恒真）；裸列引用不受限。
- **成本硬封顶**：单次运行迭代数上限 `AGENT_MAX_ITERATIONS_LIMIT`（50）、单轮生成 Token 上限 `AGENT_MAX_TOKENS_PER_TURN_LIMIT`（100000）、研究子任务数量/轮数上限（10 / 8）；对话端点按「租户+用户」限流（默认 30 次/分钟）。

## 上下文管理

`createContextManager()` 创建对话上下文管理器，维护多轮对话的消息历史：

```typescript
import { createContextManager } from "@ventostack/ai";

const contextManager = createContextManager();

// 创建新对话
const ctx = contextManager.create("你是一个专业的技术支持助手");
console.log(ctx.conversationId);

// 添加用户消息
contextManager.addMessage(ctx.conversationId, "user", "如何创建一个路由？");

// 添加助手回复
contextManager.addMessage(ctx.conversationId, "assistant", "使用 createRouter() 创建路由实例...");

// 获取历史消息
const history = contextManager.getHistory(ctx.conversationId, 10);

// 设置元数据
contextManager.setMetadata(ctx.conversationId, "userId", "user_123");

// 截断消息（只保留最近 20 条）
const removed = contextManager.truncate(ctx.conversationId, 20);

// 销毁对话
contextManager.destroy(ctx.conversationId);
```

## 接口定义

```typescript
/** 工具定义 */
interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  requiresApproval?: boolean;
  riskLevel?: "low" | "medium" | "high" | "critical";
  timeout?: number;
}

/** 工具执行结果 */
interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  timestamp: number;
}

/** 工具注册表 */
interface ToolRegistry {
  register(tool: ToolDefinition): void;
  unregister(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  execute(name: string, params: Record<string, unknown>): Promise<ToolExecutionResult>;
  validateParams(name: string, params: Record<string, unknown>): { valid: boolean; errors: string[] };
  toJSONSchema(): Array<{ name: string; description: string; parameters: object }>;
}

/** 沙箱权限配置 */
interface SandboxPermissions {
  allowedTools?: string[];
  allowedHosts?: string[];
  maxExecutionTime?: number;
  maxMemory?: number;
  allowFileRead?: boolean;
  allowFileWrite?: boolean;
  allowNetworkAccess?: boolean;
  workingDirectory?: string;
}

/** 沙箱实例 */
interface Sandbox {
  canExecute(toolName: string): boolean;
  canAccessURL(url: string): boolean;
  canAccessPath(filePath: string, mode: "read" | "write"): boolean;
  wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T>;
  getPermissions(): SandboxPermissions;
}

/** 审批请求 */
interface ApprovalRequest {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  requestedBy: string;
  requestedAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewedBy?: string;
  reviewedAt?: number;
  reason?: string;
  expiresAt: number;
}

/** 审批管理器 */
interface ApprovalManager {
  request(toolName: string, params: Record<string, unknown>, requestedBy: string): Promise<ApprovalRequest>;
  approve(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;
  reject(id: string, reviewedBy: string, reason?: string): ApprovalRequest | null;
  getStatus(id: string): ApprovalRequest | null;
  listPending(): ApprovalRequest[];
  cleanup(): number;
}

/** 对话消息 */
interface ConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  timestamp: number;
}

/** 上下文管理器 */
interface ContextManager {
  create(systemPrompt?: string): ConversationContext;
  get(conversationId: string): ConversationContext | null;
  addMessage(conversationId: string, role: "user" | "assistant" | "tool", content: string, toolCallId?: string): ConversationMessage | null;
  getHistory(conversationId: string, limit?: number): ConversationMessage[];
  setMetadata(conversationId: string, key: string, value: unknown): boolean;
  destroy(conversationId: string): boolean;
  listActive(): string[];
  truncate(conversationId: string, maxMessages: number): number;
}
```
