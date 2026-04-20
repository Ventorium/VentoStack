// @aeron/ai - AI Tool 调用、权限沙箱、审批流与上下文管理

export { createToolRegistry } from "./tool-registry";
export type {
  ToolParameter,
  ToolDefinition,
  ToolExecutionResult,
  ToolRegistry,
} from "./tool-registry";

export { createSandbox } from "./sandbox";
export type { SandboxPermissions, Sandbox } from "./sandbox";

export { createApprovalManager } from "./approval";
export type {
  ApprovalStatus,
  ApprovalRequest,
  ApprovalOptions,
  ApprovalManager,
} from "./approval";

export { createContextManager } from "./context";
export type {
  ConversationMessage,
  ConversationContext,
  ContextManager,
} from "./context";

export { createKnowledgeBase, createAgentRegistry } from "./rag";
export type {
  Document,
  ChunkOptions,
  SearchResult,
  KnowledgeBase,
  AgentConfig,
  AgentRegistry,
} from "./rag";
