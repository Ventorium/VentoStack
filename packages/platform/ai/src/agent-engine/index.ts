/**
 * Agent Engine 模块
 */
export { createAgentLoop } from "./agent-loop";
export type {
  AgentConfig,
  AgentLoopDeps,
} from "./agent-loop";

export { createEventEmitter } from "./events";
export type {
  AgentEvent,
  AgentEventHandler,
  AgentEventEmitter,
  AgentEventMessage,
  AgentStartEvent,
  AgentEndEvent,
  TurnStartEvent,
  TurnEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  MessageEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolExecutionEndEvent,
  ContextEvent,
  BeforeProviderRequestEvent,
  AbortEvent,
  SettledEvent,
  ErrorEvent,
} from "./events";

export { createAgentHarness } from "./harness";
export type {
  AgentHarness,
  AgentHarnessOptions,
  HarnessEvent,
  HarnessOwnEvent,
  HarnessToolUpdateEvent,
  HarnessModelUpdateEvent,
  HarnessResourcesUpdateEvent,
} from "./harness";

export { createMessageQueue } from "./message-queue";
export type { MessageQueue, QueueMode } from "./message-queue";

export type {
  AgentTool,
  AgentToolResult,
  AgentContext,
  AgentLoopConfig,
  AgentRunParams,
  AgentRunResult,
  ToolExecutionMode,
  BeforeToolCallContext,
  BeforeToolCallResult,
  AfterToolCallContext,
  AfterToolCallResult,
  ToolUpdateCallback,
} from "./types";

export { createDistributedLock } from "./distributed-lock";
export type { DistributedLock } from "./distributed-lock";

export { createTokenBudgetChecker } from "./token-budget";
export type { TokenBudgetConfig, TokenBudgetChecker } from "./token-budget";
