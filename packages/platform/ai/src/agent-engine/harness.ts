/**
 * Agent Harness — 高级生命周期管理器
 *
 * 对齐参考实现的 AgentHarness，统一管理：
 * - Session（树形会话 + JSONL 持久化）
 * - Skills（SKILL.md 加载 + system prompt 注入）
 * - Prompt Templates（模板加载 + 参数替换）
 * - Tools（动态增删 + active/inactive）
 * - Compaction（自动上下文压缩）
 * - Message Queues（steering + follow-up）
 * - Model/Provider 管理
 * - 完整事件订阅
 */
import type { LLMGateway, ChatMessage } from "../llm-gateway/types";
import type { Skill, SkillManager } from "../skills/types";
import type { PromptTemplate, PromptTemplateManager } from "../prompt-templates/types";
import type { Session } from "../session/types";
import { createEventEmitter } from "./events";
import type { AgentEventEmitter, AgentEvent, AgentEventMessage } from "./events";
import type { AgentTool, ToolExecutionMode, BeforeToolCallContext, BeforeToolCallResult, AfterToolCallContext, AfterToolCallResult } from "./types";
import type { CompactionSettings } from "../compaction/compaction";
import { createMessageQueue } from "./message-queue";
import type { MessageQueue, QueueMode } from "./message-queue";
import type { ModelConfig, ModelRegistry } from "../llm-gateway/model-registry";

// ---- Harness 事件 ----

export interface HarnessToolUpdateEvent {
  type: "tools_update";
  toolNames: string[];
  previousToolNames: string[];
  activeToolNames: string[];
  previousActiveToolNames: string[];
  source: "set";
}

export interface HarnessModelUpdateEvent {
  type: "model_update";
  modelId: string;
  previousModelId: string;
}

export interface HarnessResourcesUpdateEvent {
  type: "resources_update";
  skillNames: string[];
  templateNames: string[];
  previousSkillNames: string[];
  previousTemplateNames: string[];
}

export type HarnessOwnEvent =
  | HarnessToolUpdateEvent
  | HarnessModelUpdateEvent
  | HarnessResourcesUpdateEvent;

export type HarnessEvent = AgentEvent | HarnessOwnEvent;

// ---- Harness 配置 ----

export interface AgentHarnessOptions {
  /** LLM Gateway */
  gateway: LLMGateway;
  /** Session 实例 */
  session: Session;
  /** Skill Manager */
  skillManager?: SkillManager;
  /** Prompt Template Manager */
  promptTemplateManager?: PromptTemplateManager;
  /** Model Registry */
  modelRegistry?: ModelRegistry;
  /** 初始工具 */
  tools?: AgentTool[];
  /** 初始活跃工具名称 */
  activeToolNames?: string[];
  /** 事件发射器 */
  eventEmitter?: AgentEventEmitter;
  /** 初始模型 ID */
  modelId?: string;
  /** 工具执行模式 */
  toolExecutionMode?: ToolExecutionMode;
  /** steering 消息队列模式 */
  steeringMode?: QueueMode;
  /** follow-up 消息队列模式 */
  followUpMode?: QueueMode;
  /** 压缩设置 */
  compactionSettings?: CompactionSettings;
  /** beforeToolCall 钩子 */
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  /** afterToolCall 钩子 */
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
  /** 动态 system prompt */
  systemPrompt?:
    | string
    | ((context: {
        session: Session;
        modelId: string;
        activeTools: AgentTool[];
        skills: Skill[];
        templates: PromptTemplate[];
      }) => string | Promise<string>);
}

// ---- Harness 接口 ----

export interface AgentHarness {
  // State
  getModelId(): string;
  getTools(): AgentTool[];
  getActiveTools(): AgentTool[];
  getActiveToolNames(): string[];
  getSkills(): Skill[];
  getTemplates(): PromptTemplate[];
  isStreaming(): boolean;

  // Mutation
  setModel(modelId: string): Promise<void>;
  setTools(tools: AgentTool[], activeToolNames?: string[]): Promise<void>;
  setActiveTools(toolNames: string[]): Promise<void>;
  setToolExecutionMode(mode: ToolExecutionMode): void;

  // Queue management
  steer(message: ChatMessage): void;
  followUp(message: ChatMessage): void;
  getSteeringMode(): QueueMode;
  setSteeringMode(mode: QueueMode): void;
  getFollowUpMode(): QueueMode;
  setFollowUpMode(mode: QueueMode): void;

  // Lifecycle
  prompt(message: string, options?: { signal?: AbortSignal }): AsyncIterable<import("../llm-gateway/types").StreamChunk>;
  abort(): Promise<void>;
  waitForIdle(): Promise<void>;

  // Events
  on(handler: (event: HarnessEvent, signal?: AbortSignal) => Promise<void> | void): () => void;

  // Session
  getSession(): Session;

  // Compaction
  compact(signal?: AbortSignal): Promise<boolean>;

  // Resources
  reloadResources(): Promise<void>;
}

// ---- Implementation ----

export function createAgentHarness(options: AgentHarnessOptions): AgentHarness {
  const {
    gateway,
    session,
    skillManager,
    promptTemplateManager,
    modelRegistry,
    eventEmitter: externalEmitter,
    compactionSettings,
  } = options;

  // State
  let currentModelId = options.modelId ?? "gpt-4o";
  let tools = new Map<string, AgentTool>();
  let activeToolNames: string[] = [];
  let streaming = false;
  let abortController: AbortController | null = null;
  let idlePromise: Promise<void> = Promise.resolve();
  let idleResolve: (() => void) | null = null;
  let toolExecMode = options.toolExecutionMode ?? "sequential";

  // 消息队列
  const steerQueue: MessageQueue<ChatMessage> = createMessageQueue(options.steeringMode ?? "all");
  const followUpQueue: MessageQueue<ChatMessage> = createMessageQueue(options.followUpMode ?? "all");

  // 事件系统
  const eventEmitter = externalEmitter ?? createEventEmitter();

  // 事件订阅
  const handlers = new Set<(event: HarnessEvent, signal?: AbortSignal) => Promise<void> | void>();

  function emit(event: HarnessEvent, signal?: AbortSignal): Promise<void> {
    return eventEmitter.emit(event as AgentEvent, signal);
  }

  // 初始化工具
  if (options.tools) {
    for (const tool of options.tools) {
      tools.set(tool.name, tool);
    }
    activeToolNames = options.activeToolNames ?? options.tools.map((t) => t.name);
  }

  // ---- Getters ----

  function getModelId(): string {
    return currentModelId;
  }

  function getTools(): AgentTool[] {
    return [...tools.values()];
  }

  function getActiveTools(): AgentTool[] {
    return activeToolNames
      .map((name) => tools.get(name))
      .filter((t): t is AgentTool => t !== undefined);
  }

  function getActiveToolNames(): string[] {
    return [...activeToolNames];
  }

  function getSkills(): Skill[] {
    return skillManager?.getSkills() ?? [];
  }

  function getTemplates(): PromptTemplate[] {
    return promptTemplateManager?.getTemplates() ?? [];
  }

  function isStreaming(): boolean {
    return streaming;
  }

  // ---- Mutation ----

  async function setModel(modelId: string): Promise<void> {
    const previousModelId = currentModelId;
    currentModelId = modelId;
    await emit({ type: "model_update", modelId, previousModelId });
  }

  async function setTools(
    newTools: AgentTool[],
    newActiveNames?: string[],
  ): Promise<void> {
    const previousToolNames = [...tools.keys()];
    const previousActiveToolNames = [...activeToolNames];

    tools = new Map(newTools.map((t) => [t.name, t]));
    activeToolNames = newActiveNames ?? newTools.map((t) => t.name);

    await emit({
      type: "tools_update",
      toolNames: [...tools.keys()],
      previousToolNames,
      activeToolNames: [...activeToolNames],
      previousActiveToolNames,
      source: "set",
    });
  }

  async function setActiveTools(names: string[]): Promise<void> {
    const previousActiveToolNames = [...activeToolNames];
    activeToolNames = [...names];
    await emit({
      type: "tools_update",
      toolNames: [...tools.keys()],
      previousToolNames: [...tools.keys()],
      activeToolNames: [...activeToolNames],
      previousActiveToolNames,
      source: "set",
    });
  }

  function setToolExecutionMode(mode: ToolExecutionMode): void {
    toolExecMode = mode;
  }

  // ---- Queue ----

  function steer(message: ChatMessage): void {
    steerQueue.enqueue(message);
  }

  function followUp(message: ChatMessage): void {
    followUpQueue.enqueue(message);
  }

  function getSteeringMode(): QueueMode {
    return steerQueue.getMode();
  }

  function setSteeringMode(mode: QueueMode): void {
    steerQueue.setMode(mode);
  }

  function getFollowUpMode(): QueueMode {
    return followUpQueue.getMode();
  }

  function setFollowUpMode(mode: QueueMode): void {
    followUpQueue.setMode(mode);
  }

  // ---- Lifecycle ----

  async function buildSystemPrompt(): Promise<string> {
    if (typeof options.systemPrompt === "function") {
      return await options.systemPrompt({
        session,
        modelId: currentModelId,
        activeTools: getActiveTools(),
        skills: getSkills(),
        templates: getTemplates(),
      });
    }
    return options.systemPrompt ?? "你是一个智能助手。";
  }

  async function *prompt(
    message: string,
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<import("../llm-gateway/types").StreamChunk> {
    if (streaming) {
      throw new Error("Agent is already processing.");
    }

    streaming = true;
    const ac = new AbortController();
    abortController = ac;

    // 合并外部 signal
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => ac.abort());
    }

    idlePromise = new Promise<void>((resolve) => {
      idleResolve = resolve;
    });

    try {
      const systemPrompt = await buildSystemPrompt();

      // 加载历史
      const context = await session.buildContext();
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...context.messages.map((m) => ({
          role: m.role as ChatMessage["role"],
          content: m.content,
          ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        })),
        { role: "user" as const, content: message },
      ];

      // 记录用户消息
      await session.appendMessage({
        role: "user",
        content: message,
        timestamp: Date.now(),
      });

      // 工具定义
      const activeTools = getActiveTools();
      const toolDefs = activeTools.length > 0
        ? activeTools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as { type: "object"; properties: Record<string, unknown>; required?: string[] },
          }))
        : undefined;

      await emit({ type: "agent_start" }, ac.signal);
      await emit({ type: "turn_start" }, ac.signal);

      // 简化实现：直接调用 LLM Gateway
      const stream = gateway.chatStream({
        model: currentModelId,
        messages,
        tools: toolDefs,
        signal: ac.signal,
      });

      let fullContent = "";
      for await (const chunk of stream) {
        if (chunk.type === "content" && chunk.delta) {
          fullContent += chunk.delta;
        }
        yield chunk;
      }

      // 记录 assistant 消息
      await session.appendMessage({
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        model: currentModelId,
      });

      await emit({
        type: "message_end",
        message: { role: "assistant", content: fullContent, timestamp: Date.now() },
      }, ac.signal);

      await emit({
        type: "turn_end",
        message: { role: "assistant", content: fullContent, timestamp: Date.now() },
        toolResults: [],
      }, ac.signal);

      await emit({
        type: "agent_end",
        messages: [{ role: "assistant", content: fullContent, timestamp: Date.now() }],
      }, ac.signal);

      yield { type: "done" };
    } catch (error) {
      await emit({ type: "error", error: { code: "AGENT_ERROR", message: error instanceof Error ? error.message : String(error), recoverable: false } }, ac.signal);
      yield { type: "error", error: { code: "AGENT_ERROR", message: error instanceof Error ? error.message : String(error), recoverable: false } };
    } finally {
      streaming = false;
      abortController = null;
      idleResolve?.();
    }
  }

  async function abort(): Promise<void> {
    steerQueue.clear();
    followUpQueue.clear();
    abortController?.abort();
    await waitForIdle();
  }

  async function waitForIdle(): Promise<void> {
    await idlePromise;
  }

  // ---- Events ----

  function on(
    handler: (event: HarnessEvent, signal?: AbortSignal) => Promise<void> | void,
  ): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  // ---- Session ----

  function getSession(): Session {
    return session;
  }

  // ---- Compaction ----

  async function compact(signal?: AbortSignal): Promise<boolean> {
    if (!compactionSettings?.enabled) return false;

    const { prepareCompaction, compact: doCompact } = await import("../compaction/compaction");
    const entries = await session.getEntries();
    const preparation = prepareCompaction(entries, compactionSettings ?? { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 });

    if (!preparation) return false;

    const result = await doCompact(preparation, gateway, currentModelId, signal);

    await session.appendCompaction(
      result.summary,
      result.firstKeptEntryId,
      result.tokensBefore,
      result.details,
    );

    return true;
  }

  // ---- Resources ----

  async function reloadResources(): Promise<void> {
    if (skillManager) await skillManager.reload();
    if (promptTemplateManager) await promptTemplateManager.reload();

    await emit({
      type: "resources_update",
      skillNames: skillManager?.getSkills().map((s) => s.name) ?? [],
      templateNames: promptTemplateManager?.getTemplates().map((t) => t.name) ?? [],
      previousSkillNames: [],
      previousTemplateNames: [],
    });
  }

  return {
    getModelId,
    getTools,
    getActiveTools,
    getActiveToolNames,
    getSkills,
    getTemplates,
    isStreaming,
    setModel,
    setTools,
    setActiveTools,
    setToolExecutionMode,
    steer,
    followUp,
    getSteeringMode,
    setSteeringMode,
    getFollowUpMode,
    setFollowUpMode,
    prompt,
    abort,
    waitForIdle,
    on,
    getSession,
    compact,
    reloadResources,
  };
}
