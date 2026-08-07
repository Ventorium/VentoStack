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
import type { LLMGateway, ChatMessage, ThinkingLevel } from "../llm-gateway/types";
import type { Skill, SkillManager } from "../skills/types";
import type { PromptTemplate, PromptTemplateManager } from "../prompt-templates/types";
import type { Session } from "../session/types";
import { createEventEmitter } from "./events";
import type { AgentEventEmitter, AgentEvent, AgentEventMessage } from "./events";
import type {
  AgentTool,
  ToolExecutionMode,
  BeforeToolCallContext,
  BeforeToolCallResult,
  AfterToolCallContext,
  AfterToolCallResult,
  ToolCallAuthorizer,
  AgentLoopTurnUpdate,
  PrepareNextTurnContext,
} from "./types";
import type { CompactionSettings } from "../compaction/compaction";
import { createMessageQueue } from "./message-queue";
import type { MessageQueue, QueueMode } from "./message-queue";
import type { ModelConfig, ModelRegistry } from "../llm-gateway/model-registry";
import { createAgentLoop } from "./agent-loop";
import { formatSkillsForSystemPrompt } from "../skills/system-prompt";
import { estimateSessionContextTokens, shouldCompact } from "../compaction/compaction";

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
  /** Required to execute tools marked requiresApproval. */
  authorizeToolCall?: ToolCallAuthorizer;
  /** 上下文变换钩子（每次 LLM 请求前，对齐参考实现 transformContext） */
  transformContext?: (
    messages: ChatMessage[],
    signal?: AbortSignal,
  ) => Promise<ChatMessage[]> | ChatMessage[];
  /** turn 结束后替换下一轮 model / systemPrompt（对齐参考实现 prepareNextTurn） */
  prepareNextTurn?: (
    context: PrepareNextTurnContext,
    signal?: AbortSignal,
  ) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
  /** 动态 API Key 解析（对齐参考实现 getApiKey） */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  /** 动态工具解析（对齐参考实现 addedToolNames） */
  dynamicToolResolver?: (toolName: string, tenantId: string) => Promise<AgentTool | undefined> | AgentTool | undefined;
  /** 分布式追踪器（@ventostack/observability）；提供时自动埋 ai.run / ai.turn / ai.tool span */
  tracer?: import("@ventostack/observability").Tracer;
  /** 父 span 上下文，用于把 AI 运行串进上层请求链路 */
  parentSpanContext?: { traceId: string; spanId: string };
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
  getThinkingLevel(): ThinkingLevel;
  getTools(): AgentTool[];
  getActiveTools(): AgentTool[];
  getActiveToolNames(): string[];
  getSkills(): Skill[];
  getTemplates(): PromptTemplate[];
  isStreaming(): boolean;

  // Mutation
  setModel(modelId: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
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

function isThinkingLevel(value: string): value is ThinkingLevel {
  return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

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
  let thinkingLevel: ThinkingLevel = "off";
  let tools = new Map<string, AgentTool>();
  let activeToolNames: string[] = [];
  let streaming = false;
  let abortController: AbortController | null = null;
  let idlePromise: Promise<void> = Promise.resolve();
  let idleResolve: (() => void) | null = null;
  let toolExecMode = options.toolExecutionMode ?? "parallel";
  let sessionStateRestored = false;

  // 消息队列
  const steerQueue: MessageQueue<ChatMessage> = createMessageQueue(options.steeringMode ?? "all");
  const followUpQueue: MessageQueue<ChatMessage> = createMessageQueue(options.followUpMode ?? "all");

  // 事件系统
  const eventEmitter = createEventEmitter();
  if (externalEmitter) {
    eventEmitter.on((event, signal) => externalEmitter.emit(event, signal));
  }

  // 事件订阅
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

  function getThinkingLevel(): ThinkingLevel {
    return thinkingLevel;
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
    const slashIndex = modelId.indexOf("/");
    await session.appendModelChange(
      slashIndex > 0 ? modelId.slice(0, slashIndex) : gateway.getDefaultProvider().name,
      slashIndex > 0 ? modelId.slice(slashIndex + 1) : modelId,
    );
    await emit({ type: "model_update", modelId, previousModelId });
  }

  async function setThinkingLevel(level: ThinkingLevel): Promise<void> {
    thinkingLevel = level;
    await session.appendThinkingLevelChange(level);
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
    await session.appendActiveToolsChange(activeToolNames);
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
    const basePrompt = options.systemPrompt ?? "你是一个智能助手。";
    const skillPrompt = formatSkillsForSystemPrompt(getSkills());
    return skillPrompt ? `${basePrompt}\n\n${skillPrompt}` : basePrompt;
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
      if (!sessionStateRestored) {
        const saved = await session.buildContext();
        if (options.modelId === undefined && saved.model) {
          currentModelId = `${saved.model.provider}/${saved.model.modelId}`;
        }
        if (options.activeToolNames === undefined && saved.activeToolNames) {
          activeToolNames = saved.activeToolNames.filter((name) => tools.has(name));
        }
        if (isThinkingLevel(saved.thinkingLevel)) thinkingLevel = saved.thinkingLevel;
        sessionStateRestored = true;
      }

      if (compactionSettings?.enabled) {
        const branch = await session.getBranch();
        const modelContextWindow = modelRegistry?.get(currentModelId)?.contextLength
          ?? gateway.getDefaultProvider().capabilities.maxContextLength;
        if (shouldCompact(estimateSessionContextTokens(branch), modelContextWindow, compactionSettings)) {
          await compact(ac.signal);
        }
      }

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

      const runtime = createAgentLoop({
        llmGateway: gateway,
        agentTools: getActiveTools(),
        eventEmitter,
        ...(options.beforeToolCall ? { beforeToolCall: options.beforeToolCall } : {}),
        ...(options.afterToolCall ? { afterToolCall: options.afterToolCall } : {}),
        ...(options.authorizeToolCall ? { authorizeToolCall: options.authorizeToolCall } : {}),
        ...(options.transformContext ? { transformContext: options.transformContext } : {}),
        ...(options.prepareNextTurn ? { prepareNextTurn: options.prepareNextTurn } : {}),
        ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
        ...(options.dynamicToolResolver ? { dynamicToolResolver: options.dynamicToolResolver } : {}),
        ...(options.tracer ? { tracer: options.tracer } : {}),
        ...(options.parentSpanContext ? { parentSpanContext: options.parentSpanContext } : {}),
        toolExecutionMode: toolExecMode,
        getSteeringMessages: async () => steerQueue.drain(),
        getFollowUpMessages: async () => followUpQueue.drain(),
      });

      const unsubscribePersistence = eventEmitter.onType("message_end", async (event) => {
        if (event.message.role !== "assistant" && event.message.role !== "tool") return;
        await session.appendMessage({
          role: event.message.role,
          content: event.message.content,
          timestamp: event.message.timestamp,
          ...(event.message.toolCallId ? { toolCallId: event.message.toolCallId } : {}),
          ...(event.message.toolCalls ? { toolCalls: event.message.toolCalls } : {}),
          model: currentModelId,
        });
      });

      const metadata = await session.getMetadata();
      const stream = runtime.runStream({
        agentId: metadata.id,
        userId: "harness",
        tenantId: "default",
        sessionId: metadata.id,
        message,
        systemPrompt,
        model: currentModelId,
        thinkingLevel,
        history: messages.slice(1, -1),
        signal: ac.signal,
      });

      try {
        for await (const chunk of stream) yield chunk;
      } finally {
        unsubscribePersistence();
      }
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
    return eventEmitter.on(handler as (event: AgentEvent, signal?: AbortSignal) => Promise<void> | void);
  }

  // ---- Session ----

  function getSession(): Session {
    return session;
  }

  // ---- Compaction ----

  async function compact(signal?: AbortSignal): Promise<boolean> {
    if (!compactionSettings?.enabled) return false;

    const { prepareCompaction, compact: doCompact } = await import("../compaction/compaction");
    const entries = await session.getBranch();
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
    getThinkingLevel,
    getTools,
    getActiveTools,
    getActiveToolNames,
    getSkills,
    getTemplates,
    isStreaming,
    setModel,
    setThinkingLevel,
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
