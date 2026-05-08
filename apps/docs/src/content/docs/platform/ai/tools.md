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
  allowedTools: ["get_weather", "search_document"],
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
