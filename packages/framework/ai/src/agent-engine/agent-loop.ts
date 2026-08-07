import type { KnowledgeBaseService } from '../knowledge-base/types';
import type { ChatMessage, LLMGateway, StreamChunk, ThinkingLevel, ToolCall } from '../llm-gateway/types';
import type { Tracer, SpanHandle } from '@ventostack/observability';
import type { MemoryService } from '../memory/types';
import type { McpToolSource } from './mcp-tool-source';
import type { Skill } from '../skills/types';
import { formatSkillInvocation } from '../skills/system-prompt';
import type { ToolRegistry } from '../tool-registry';
import type { AgentEventEmitter, AgentEventMessage, AgentToolResultEventMessage } from './events';
import { createEventEmitter } from './events';
import { fitMessagesToBudget } from './prompt-builder';
import { type PromptGuard, createPromptGuard } from './prompt-guard';
import { validateAgentToolArguments } from './tool-call-handler';
import type {
  AgentContext,
  AgentLoopConfig,
  AgentTool,
  AgentToolResult,
  ToolExecutionMode,
  ToolCallAuthorizer,
} from './types';

// ---- 配置与依赖 ----

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  maxIterations?: number;
  maxTokensPerTurn?: number;
  temperature?: number;
  tenantId: string;
}

export interface AgentCrudService {
  getById(id: string, tenantId: string): Promise<AgentConfig | null>;
}

export interface AgentLoopDeps {
  llmGateway: LLMGateway;
  toolRegistry?: ToolRegistry;
  knowledgeBase?: KnowledgeBaseService;
  memory?: MemoryService;
  promptGuard?: PromptGuard;
  eventEmitter?: AgentEventEmitter;
  agentService?: AgentCrudService;
  /** Agent 级别的 tools（增强版，支持 hooks） */
  agentTools?: AgentTool[];
  /** beforeToolCall 钩子 */
  beforeToolCall?: AgentLoopConfig['beforeToolCall'];
  /** afterToolCall 钩子 */
  afterToolCall?: AgentLoopConfig['afterToolCall'];
  /** 工具执行模式 */
  toolExecutionMode?: ToolExecutionMode;
  getSteeringMessages?: AgentLoopConfig['getSteeringMessages'];
  getFollowUpMessages?: AgentLoopConfig['getFollowUpMessages'];
  shouldStopAfterTurn?: AgentLoopConfig['shouldStopAfterTurn'];
  mcpToolSource?: McpToolSource;
  resolveSkills?: (skillIds: string[], tenantId: string) => Promise<Skill[]>;
  authorizeToolCall?: ToolCallAuthorizer;
  /**
   * 在每次 LLM 请求前对消息做上下文变换（对齐参考实现 transformContext）。
   */
  transformContext?: AgentLoopConfig['transformContext'];
  /**
   * 在 turn 结束后、决定下一轮 provider 请求前调用（对齐参考实现 prepareNextTurn）。
   */
  prepareNextTurn?: AgentLoopConfig['prepareNextTurn'];
  /**
   * 动态解析每次 LLM 请求的 API Key（对齐参考实现 getApiKey）。
   * 以模型字符串的 provider 前缀（如 "openai"）为参数。
   */
  getApiKey?: AgentLoopConfig['getApiKey'];
  /**
   * 解析工具结果声明的动态新工具（对齐参考实现 addedToolNames）。
   * 解析成功后工具会被注册到运行时工具集，供后续轮次使用。
   */
  dynamicToolResolver?: (toolName: string, tenantId: string) => Promise<AgentTool | undefined> | AgentTool | undefined;
  /**
   * 分布式追踪器（@ventostack/observability）。提供时会在 agent 运行 / 每轮 LLM 请求 / 每次工具执行
   * 处埋 span，记录 model、token、耗时、错误等属性。
   */
  tracer?: Tracer;
  /** 父 span 上下文，用于把 AI 运行串进上层请求链路 */
  parentSpanContext?: { traceId: string; spanId: string };
}

export interface AgentRunParams {
  agentId: string;
  userId: string;
  sessionId?: string;
  message: string;
  tenantId: string;
  signal?: AbortSignal;
  // 能力过滤器
  tools?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  knowledgeBaseIds?: string[];
  /** Runtime overrides used by higher-level harnesses. */
  systemPrompt?: string;
  model?: string;
  history?: ChatMessage[];
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentLoop {
  runStream(params: AgentRunParams): AsyncIterable<StreamChunk>;
}

// ---- 辅助函数 ----

function createErrorToolResult(message: string): AgentToolResult {
  return {
    content: [{ type: 'text', text: message }],
    details: {},
  };
}

function isEarlyTermination(finalizedCalls: Array<{ result: AgentToolResult }>): boolean {
  return finalizedCalls.length > 0 && finalizedCalls.every((f) => f.result.terminate === true);
}

/** 从 ToolRegistry 包装为 AgentTool[] */
function wrapRegistryTools(registry: ToolRegistry, filterTools?: string[]): AgentTool[] {
  const allTools = registry.list();
  const filtered =
    filterTools && filterTools.length > 0
      ? allTools.filter((t) => filterTools.includes(t.name))
      : allTools;

  return filtered.map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        toolDef.parameters.map((p) => [
          p.name,
          {
            type: p.type,
            description: p.description,
            ...(p.schema ?? {}),
          },
        ]),
      ),
      required: toolDef.parameters.filter((p) => p.required).map((p) => p.name),
    },
    label: toolDef.name,
    execute: async (_id, params) => {
      const result = await registry.execute(toolDef.name, params as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text' as const,
            text:
              typeof result.result === 'string'
                ? result.result
                : JSON.stringify(result.result ?? result.error ?? ''),
          },
        ],
        details: result,
        terminate: false,
      };
    },
    ...(toolDef.requiresApproval === undefined ? {} : { requiresApproval: toolDef.requiresApproval }),
    ...(toolDef.riskLevel === undefined ? {} : { riskLevel: toolDef.riskLevel }),
    ...(toolDef.timeout === undefined ? {} : { timeout: toolDef.timeout }),
  }));
}

// ---- 工具执行准备 ----

interface PreparedToolCall {
  kind: 'prepared';
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  tool: AgentTool;
  args: Record<string, unknown>;
}

interface ImmediateResult {
  kind: 'immediate';
  result: AgentToolResult;
  isError: boolean;
}

type PrepareResult = PreparedToolCall | ImmediateResult;

async function prepareToolCall(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCall: { id: string; name: string; arguments: Record<string, unknown> },
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
  authorizeToolCall: ToolCallAuthorizer | undefined,
  signal?: AbortSignal,
): Promise<PrepareResult> {
  const tool = agentTools.find((t) => t.name === toolCall.name);
  if (!tool) {
    return {
      kind: 'immediate',
      result: createErrorToolResult(`Tool ${toolCall.name} not found`),
      isError: true,
    };
  }

  try {
    // prepareArguments shim
    let args: unknown = toolCall.arguments;
    if (tool.prepareArguments) {
      args = tool.prepareArguments(args);
    }

    const validation = validateAgentToolArguments(tool, args);
    if (!validation.valid) {
      return {
        kind: 'immediate',
        result: createErrorToolResult(`Invalid tool arguments: ${validation.errors.join('; ')}`),
        isError: true,
      };
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      return {
        kind: 'immediate',
        result: createErrorToolResult('Tool arguments must be an object'),
        isError: true,
      };
    }
    const validatedArgs = args as Record<string, unknown>;

    // beforeToolCall 钩子
    if (beforeToolCall) {
      const hookResult = await beforeToolCall(
        { assistantMessage, toolCall, args: validatedArgs, context },
        signal,
      );
      if (hookResult?.block) {
        return {
          kind: 'immediate',
          result: createErrorToolResult(hookResult.reason ?? 'Tool call blocked by hook'),
          isError: true,
        };
      }
    }

    if (tool.requiresApproval) {
      if (!authorizeToolCall) {
        return {
          kind: 'immediate',
          result: createErrorToolResult(`Tool ${tool.name} requires approval`),
          isError: true,
        };
      }
      const authorization = await authorizeToolCall(
        { assistantMessage, toolCall, args: validatedArgs, context, tool },
        signal,
      );
      if (!authorization.approved) {
        return {
          kind: 'immediate',
          result: createErrorToolResult(
            authorization.reason ?? `Tool ${tool.name} was not approved`,
          ),
          isError: true,
        };
      }
    }

    return {
      kind: 'prepared',
      toolCall,
      tool,
      args: validatedArgs,
    };
  } catch (err) {
    return {
      kind: 'immediate',
      result: createErrorToolResult(
        `Tool preparation failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
      isError: true,
    };
  }
}

interface FinalizedToolCall {
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  result: AgentToolResult;
  durationMs: number;
  isError: boolean;
}

function mergeToolResult(
  result: AgentToolResult,
  override: Awaited<ReturnType<NonNullable<AgentLoopConfig['afterToolCall']>>>,
): { result: AgentToolResult; isErrorOverride?: boolean } {
  if (!override) return { result };
  return {
    result: {
      content: override.content ?? result.content,
      details: override.details ?? result.details,
      ...((override.terminate ?? result.terminate) === undefined
        ? {}
        : { terminate: override.terminate ?? result.terminate }),
      ...((override.addedToolNames ?? result.addedToolNames) === undefined
        ? {}
        : { addedToolNames: override.addedToolNames ?? result.addedToolNames }),
    },
    ...(override.isError === undefined ? {} : { isErrorOverride: override.isError }),
  };
}

function createToolSignal(signal: AbortSignal | undefined, timeout: number | undefined): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (signal) signals.push(signal);
  if (timeout !== undefined) signals.push(AbortSignal.timeout(timeout));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
}

async function executePreparedToolCall(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  prepared: PreparedToolCall,
  afterToolCall: AgentLoopConfig['afterToolCall'],
  emit: (event: Parameters<AgentEventEmitter['emit']>[0], signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
  tracer?: Tracer,
  parentSpanContext?: { traceId: string; spanId: string },
): Promise<FinalizedToolCall> {
  const { toolCall, tool, args } = prepared;
  const start = Date.now();
  const toolSpan = tracer ? tracer.startSpan('ai.tool', parentSpanContext) : null;
  toolSpan?.setAttribute('tool', toolCall.name);
  await emit({ type: 'tool_execution_start', toolCallId: toolCall.id, toolName: toolCall.name, args }, signal);

  let result: AgentToolResult;
  let isError = false;
  try {
    result = await tool.execute(
      toolCall.id,
      args,
      createToolSignal(signal, tool.timeout),
      (partialResult) => {
        void emit({
          type: 'tool_execution_update',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args,
          partialResult,
        }, signal);
      },
    );

    if (afterToolCall) {
      const override = await afterToolCall(
        { assistantMessage, toolCall, args, result, isError, context },
        signal,
      );
      const merged = mergeToolResult(result, override);
      result = merged.result;
      if (merged.isErrorOverride !== undefined) isError = merged.isErrorOverride;
    }
  } catch (err) {
    isError = true;
    result = createErrorToolResult(
      `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    toolSpan?.setAttribute('duration_ms', Date.now() - start);
    toolSpan?.setAttribute('is_error', isError);
    toolSpan?.setStatus(isError ? 'error' : 'ok');
    toolSpan?.end();
  }

  await emit({
    type: 'tool_execution_end',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    result,
    isError,
  }, signal);
  return { toolCall, result, durationMs: Date.now() - start, isError };
}

async function executeToolCallsSequential(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
  authorizeToolCall: ToolCallAuthorizer | undefined,
  afterToolCall: AgentLoopConfig['afterToolCall'],
  emit: (event: Parameters<AgentEventEmitter['emit']>[0], signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
  tracer?: Tracer,
  parentSpanContext?: { traceId: string; spanId: string },
): Promise<FinalizedToolCall[]> {
  const results: FinalizedToolCall[] = [];
  for (const tc of toolCalls) {
    if (signal?.aborted) break;
    const prepared = await prepareToolCall(
      context,
      assistantMessage,
      tc,
      agentTools,
      beforeToolCall,
      authorizeToolCall,
      signal,
    );
    if (prepared.kind === 'immediate') {
      await emit({ type: 'tool_execution_start', toolCallId: tc.id, toolName: tc.name, args: tc.arguments }, signal);
      await emit({ type: 'tool_execution_end', toolCallId: tc.id, toolName: tc.name, result: prepared.result, isError: prepared.isError }, signal);
      results.push({ toolCall: tc, result: prepared.result, durationMs: 0, isError: prepared.isError });
      continue;
    }
    results.push(await executePreparedToolCall(context, assistantMessage, prepared, afterToolCall, emit, signal, tracer, parentSpanContext));
  }
  return results;
}

async function executeToolCallsParallel(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
  authorizeToolCall: ToolCallAuthorizer | undefined,
  afterToolCall: AgentLoopConfig['afterToolCall'],
  emit: (event: Parameters<AgentEventEmitter['emit']>[0], signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
  tracer?: Tracer,
  parentSpanContext?: { traceId: string; spanId: string },
): Promise<FinalizedToolCall[]> {
  const preparedCalls: Array<{ index: number; prepared: PrepareResult; toolCall: PreparedToolCall['toolCall'] }> = [];
  for (const [index, tc] of toolCalls.entries()) {
    if (signal?.aborted) break;
    const prepared = await prepareToolCall(
      context,
      assistantMessage,
      tc,
      agentTools,
      beforeToolCall,
      authorizeToolCall,
      signal,
    );
    preparedCalls.push({ index, prepared, toolCall: tc });
  }

  const results = await Promise.all(preparedCalls.map(async ({ index, prepared, toolCall }) => {
    if (prepared.kind === 'immediate') {
      await emit({ type: 'tool_execution_start', toolCallId: toolCall.id, toolName: toolCall.name, args: toolCall.arguments }, signal);
      await emit({ type: 'tool_execution_end', toolCallId: toolCall.id, toolName: toolCall.name, result: prepared.result, isError: prepared.isError }, signal);
      return { index, finalized: { toolCall, result: prepared.result, durationMs: 0, isError: prepared.isError } };
    }
    return {
      index,
      finalized: await executePreparedToolCall(context, assistantMessage, prepared, afterToolCall, emit, signal, tracer, parentSpanContext),
    };
  }));
  return results.sort((a, b) => a.index - b.index).map(({ finalized }) => finalized);
}

// ---- 主循环 ----

export function createAgentLoop(deps: AgentLoopDeps): AgentLoop {
  const guard = deps.promptGuard ?? createPromptGuard();
  const emitter = deps.eventEmitter ?? createEventEmitter();
  const toolExecMode = deps.toolExecutionMode ?? 'parallel';

  return {
    async *runStream(params: AgentRunParams): AsyncIterable<StreamChunk> {
      const { message, tenantId, userId, signal, agentId } = params;

      // 1. 获取 Agent 配置
      let agentConfig: AgentConfig | null = null;
      if (deps.agentService) {
        try {
          agentConfig = await deps.agentService.getById(agentId, tenantId);
        } catch (err) {
          console.error('Failed to fetch agent config:', err);
        }
      }

      let systemPrompt = params.systemPrompt ?? agentConfig?.systemPrompt ?? '你是一个智能助手。';
      let model = params.model ?? agentConfig?.model ?? 'default';
      const maxIterations = agentConfig?.maxIterations ?? 10;

      const skillIds = params.skillIds ?? agentConfig?.skillIds ?? [];
      if (deps.resolveSkills && skillIds.length > 0) {
        const skills = await deps.resolveSkills(skillIds, tenantId);
        if (skills.length > 0) {
          systemPrompt = `${systemPrompt}\n\n${skills.map((skill) => formatSkillInvocation(skill)).join("\n\n")}`;
        }
      }

      // 2. 根据 Agent 配置和过滤器获取工具
      let agentTools = deps.agentTools ?? [];
      if (deps.toolRegistry) {
        // 合并 Agent 配置的工具和请求过滤器
        const agentToolNames = agentConfig?.tools ?? [];
        const requestFilter = params.tools ?? [];

        // 如果有过滤器，使用交集；否则使用 Agent 配置的工具
        let effectiveTools: string[] = [];
        if (requestFilter.length > 0 && agentToolNames.length > 0) {
          effectiveTools = agentToolNames.filter((t) => requestFilter.includes(t));
        } else if (requestFilter.length > 0) {
          effectiveTools = requestFilter;
        } else if (agentToolNames.length > 0) {
          effectiveTools = agentToolNames;
        }

        agentTools = wrapRegistryTools(
          deps.toolRegistry,
          effectiveTools.length > 0 ? effectiveTools : undefined,
        );
      }
      const mcpServerIds = params.mcpServerIds ?? agentConfig?.mcpServerIds ?? [];
      if (deps.mcpToolSource && mcpServerIds.length > 0) {
        agentTools = [
          ...agentTools,
          ...(await deps.mcpToolSource.loadTools(mcpServerIds, tenantId)),
        ];
      }

      // 运行时工具集：后续轮次可通过工具结果的 addedToolNames 动态扩充
      const runtimeTools: AgentTool[] = [...agentTools];

      // 3. 输入安全检查
      const inputCheck = guard.checkInput(message);
      if (!inputCheck.safe && inputCheck.level === 'blocked') {
        await emitter.emit(
          {
            type: 'error',
            error: {
              code: 'AI_PROMPT_INJECTION',
              message: inputCheck.reason ?? '检测到不安全的输入',
              recoverable: false,
            },
          },
          signal,
        );
        yield {
          type: 'error',
          error: {
            code: 'AI_PROMPT_INJECTION',
            message: inputCheck.reason ?? '检测到不安全的输入',
            recoverable: false,
          },
        };
        return;
      }

      // 4. 加载对话历史
      let history: ChatMessage[] = params.history ? [...params.history] : [];
      if (!params.history && deps.memory && params.sessionId) {
        try {
          history = (await deps.memory.getHistory(params.sessionId, { tenantId, userId }, 20)).flatMap((item) =>
            item.role === 'system' || item.role === 'user' || item.role === 'assistant' || item.role === 'tool'
              ? [{ role: item.role, content: item.content }]
              : [],
          );
        } catch {
          /* 失败则以空历史继续 */
        }
      }

      // 5. 加载知识库上下文（如果有）
      let kbContext = '';
      if (
        agentConfig?.knowledgeBaseIds &&
        agentConfig.knowledgeBaseIds.length > 0 &&
        deps.knowledgeBase
      ) {
        try {
          const knowledgeBaseIds = params.knowledgeBaseIds ?? agentConfig.knowledgeBaseIds;
          const kbResults = (await Promise.all(
            knowledgeBaseIds.map((knowledgeBaseId) =>
              deps.knowledgeBase!.grep(knowledgeBaseId, message, undefined, tenantId, 3),
            ),
          )).flat().sort((a, b) => b.score - a.score).slice(0, 3);
          if (kbResults.length > 0) {
            kbContext = `\n\n参考知识库内容：\n${kbResults.map((r) => `- ${r.excerpt}`).join('\n')}`;
          }
        } catch {
          /* 知识库搜索失败不影响对话 */
        }
      }

      // 6. 组装消息
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt + kbContext },
        ...history,
        { role: 'user', content: message },
      ];

      const context: AgentContext = {
        agentId,
        userId,
        tenantId,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        systemPrompt,
        messages,
        tools: runtimeTools,
      };

      // 7. 工具定义（每轮从运行时工具集重算，支持动态工具引入）
      const buildToolDefs = () =>
        runtimeTools.length > 0
          ? runtimeTools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as {
                type: 'object';
                properties: Record<string, unknown>;
                required?: string[];
              },
            }))
          : undefined;

      // 8. Agent 循环
      let iteration = 0;
      let fullContent = '';

      await emitter.emit({ type: 'agent_start' }, signal);

      // ---- Telemetry spans ----
      const tracer = deps.tracer;
      const runSpan: SpanHandle | null = tracer
        ? tracer.startSpan('ai.run', deps.parentSpanContext)
        : null;
      runSpan?.setAttribute('agent_id', agentId);
      runSpan?.setAttribute('tenant_id', tenantId);
      runSpan?.setAttribute('model', model);
      runSpan?.setAttribute('session_id', params.sessionId ?? '');

      function spanError(span: SpanHandle | null, error: unknown): void {
        if (!span) return;
        span.setAttribute('error', error instanceof Error ? error.message : String(error));
        span.setStatus('error');
      }

      try {
      // prepareNextTurn：替换下一轮请求的 model / systemPrompt
      let turnStartIndex = 0;
      async function applyPrepareNextTurn(
        assistantMsg: AgentEventMessage,
        toolResults: AgentToolResultEventMessage[],
      ): Promise<void> {
        if (!deps.prepareNextTurn) return;
        const newMessages = messages.slice(turnStartIndex) as AgentEventMessage[];
        const update = await deps.prepareNextTurn(
          { message: assistantMsg, toolResults, context, newMessages },
          signal,
        );
        if (!update) return;
        if (update.model !== undefined && update.model !== model) {
          model = update.model;
        }
        if (update.systemPrompt !== undefined && update.systemPrompt !== systemPrompt) {
          systemPrompt = update.systemPrompt;
          context.systemPrompt = systemPrompt;
          const systemIdx = messages.findIndex((m) => m.role === 'system');
          if (systemIdx >= 0) messages[systemIdx] = { role: 'system', content: systemPrompt };
        }
      }

      // 动态工具：将工具结果声明的 addedToolNames 解析并注册到运行时工具集
      async function applyAddedTools(
        addedToolNames: string[] | undefined,
      ): Promise<AgentTool[]> {
        if (!addedToolNames || addedToolNames.length === 0 || !deps.dynamicToolResolver) return [];
        const previousToolNames = runtimeTools.map((t) => t.name);
        const added: AgentTool[] = [];
        for (const name of addedToolNames) {
          if (runtimeTools.some((t) => t.name === name)) continue;
          const tool = await deps.dynamicToolResolver(name, tenantId);
          if (tool) {
            runtimeTools.push(tool);
            added.push(tool);
          }
        }
        if (added.length > 0) {
          await emitter.emit(
            { type: 'tools_added', toolNames: added.map((t) => t.name), previousToolNames },
            signal,
          );
        }
        return added;
      }

      while (iteration < maxIterations) {
        iteration++;
        if (signal?.aborted) break;
        await emitter.emit({ type: 'turn_start' }, signal);
        // 记录本轮起始消息数，用于 prepareNextTurn 的 newMessages
        turnStartIndex = messages.length;

        await emitter.emit(
          { type: 'before_provider_request', model, messageCount: messages.length },
          signal,
        );

        // 上下文变换钩子（对齐参考实现 transformContext；钩子抛错时回退原消息）
        let turnMessages: ChatMessage[] = messages;
        if (deps.transformContext) {
          try {
            const transformed = await deps.transformContext(messages, signal);
            turnMessages = Array.isArray(transformed) ? transformed : messages;
          } catch {
            turnMessages = messages;
          }
        }

        // Token 预算裁剪
        const trimmedMessages = fitMessagesToBudget(turnMessages, systemPrompt);

        // 动态 API Key（对齐参考实现 getApiKey；无 provider 前缀时回退网关默认 provider）
        const apiKeyProvider = model.includes('/') ? (model.split('/')[0] ?? model) : deps.llmGateway.getDefaultProvider().name;
        const resolvedApiKey = deps.getApiKey ? await deps.getApiKey(apiKeyProvider) : undefined;

        // 调用 LLM
        const effectiveTemperature = params.temperature ?? agentConfig?.temperature;
        const effectiveMaxTokens = params.maxTokens ?? agentConfig?.maxTokensPerTurn;
        const toolDefs = buildToolDefs();
        const stream = deps.llmGateway.chatStream({
          model,
          tenantId,
          messages: trimmedMessages,
          ...(toolDefs === undefined ? {} : { tools: toolDefs }),
          ...(signal === undefined ? {} : { signal }),
          ...(params.thinkingLevel === undefined ? {} : { thinkingLevel: params.thinkingLevel }),
          ...(effectiveTemperature === undefined ? {} : { temperature: effectiveTemperature }),
          ...(effectiveMaxTokens === undefined ? {} : { maxTokens: effectiveMaxTokens }),
          ...(resolvedApiKey === undefined ? {} : { apiKey: resolvedApiKey }),
        });

        let assistantContent = '';
        const toolCalls: ToolCall[] = [];

        for await (const chunk of stream) {
          switch (chunk.type) {
            case 'content':
              assistantContent += chunk.delta ?? '';
              fullContent += chunk.delta ?? '';
              yield chunk;
              break;
            case 'tool_call_start':
              if (chunk.toolCall) toolCalls.push(chunk.toolCall);
              yield chunk;
              break;
            case 'tool_call_delta':
              yield chunk;
              break;
            case 'usage':
              yield chunk;
              break;
            case 'error':
              yield chunk;
              return;
            case 'done':
              break;
          }
        }

        // 构建 assistant 消息
        const assistantEventMsg: AgentEventMessage = {
          role: 'assistant',
          content: assistantContent,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
          timestamp: Date.now(),
        };

        // 保存 assistant 消息
        const assistantChatMsg: ChatMessage = {
          role: 'assistant',
          content: assistantContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
        messages.push(assistantChatMsg);

        await emitter.emit({ type: 'message_start', message: assistantEventMsg }, signal);
        await emitter.emit({ type: 'message_end', message: assistantEventMsg }, signal);

        // 如果没有工具调用，先处理 steering/follow-up，再决定是否结束
        if (toolCalls.length === 0) {
          await emitter.emit({ type: 'turn_end', message: assistantEventMsg, toolResults: [] }, signal);
          runSpan?.addEvent('ai.turn', { iteration, model, tool_calls: 0, output_chars: assistantContent.length });
          await applyPrepareNextTurn(assistantEventMsg, []);
          if (deps.shouldStopAfterTurn?.(assistantEventMsg, [], context)) break;

          const queued = [
            ...((await deps.getSteeringMessages?.()) ?? []),
            ...((await deps.getFollowUpMessages?.()) ?? []),
          ];
          if (queued.length === 0) break;
          for (const queuedMessage of queued) {
            messages.push(queuedMessage);
            const eventMessage: AgentEventMessage = {
              role: queuedMessage.role,
              content: queuedMessage.content,
              timestamp: Date.now(),
            };
            await emitter.emit({ type: 'message_start', message: eventMessage }, signal);
            await emitter.emit({ type: 'message_end', message: eventMessage }, signal);
          }
          continue;
        }

        const validToolCalls = toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));

        // 执行工具（使用运行时工具集，动态引入的工具可被调用）
        let finalized: FinalizedToolCall[];
        const hasSequentialTool = validToolCalls.some((call) =>
          runtimeTools.find((tool) => tool.name === call.name)?.executionMode === 'sequential',
        );
        if (toolExecMode === 'parallel' && !hasSequentialTool) {
          finalized = await executeToolCallsParallel(
            context,
            assistantEventMsg,
            validToolCalls,
            runtimeTools,
            deps.beforeToolCall,
            deps.authorizeToolCall,
            deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s),
            signal,
            deps.tracer,
            runSpan?.context(),
          );
        } else {
          finalized = await executeToolCallsSequential(
            context,
            assistantEventMsg,
            validToolCalls,
            runtimeTools,
            deps.beforeToolCall,
            deps.authorizeToolCall,
            deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s),
            signal,
            deps.tracer,
            runSpan?.context(),
          );
        }

        // 将工具结果添加到消息
        const toolResultEvents: AgentToolResultEventMessage[] = [];
        for (const fin of finalized) {
          const resultStr = fin.result.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join('\n');

          // 输出安全检查
          if (fin.toolCall.name.startsWith('fs-') || fin.toolCall.name.startsWith('kb-')) {
            const outputCheck = guard.checkOutput(resultStr, context.systemPrompt);
            if (!outputCheck.safe) {
              messages.push({
                role: 'tool',
                tool_call_id: fin.toolCall.id,
                content: JSON.stringify({ error: true, message: '工具输出被安全策略拦截' }),
              });
              continue;
            }
          }

          // 截断工具结果
          const truncated =
            resultStr.length > 8000 ? `${resultStr.slice(0, 8000)}\n...[结果已截断]` : resultStr;

          messages.push({
            role: 'tool',
            tool_call_id: fin.toolCall.id,
            content: truncated,
          });

          const toolMessage: AgentEventMessage = {
            role: 'tool',
            content: truncated,
            toolCallId: fin.toolCall.id,
            timestamp: Date.now(),
          };
          await emitter.emit({ type: 'message_start', message: toolMessage }, signal);
          await emitter.emit({ type: 'message_end', message: toolMessage }, signal);

          // 动态工具引入（对齐参考实现 addedToolNames）
          const added = await applyAddedTools(fin.result.addedToolNames);
          toolResultEvents.push({
            toolCallId: fin.toolCall.id,
            toolName: fin.toolCall.name,
            content: truncated,
            isError: fin.isError,
            timestamp: Date.now(),
            ...(added.length > 0 ? { addedToolNames: added.map((t) => t.name) } : {}),
          });
        }

        await emitter.emit({
          type: 'turn_end',
          message: assistantEventMsg,
          toolResults: toolResultEvents,
        }, signal);
        runSpan?.addEvent('ai.turn', {
          iteration,
          model,
          tool_calls: validToolCalls.length,
          tool_results: toolResultEvents.length,
          output_chars: assistantContent.length,
        });

        // prepareNextTurn（对齐参考实现）：替换下一轮 model / systemPrompt
        await applyPrepareNextTurn(assistantEventMsg, toolResultEvents);

        // 检查提前终止
        if (isEarlyTermination(finalized)) break;

        const steeringMessages = (await deps.getSteeringMessages?.()) ?? [];
        if (steeringMessages.length > 0) {
          for (const steeringMessage of steeringMessages) {
            messages.push(steeringMessage);
            const eventMessage: AgentEventMessage = {
              role: steeringMessage.role,
              content: steeringMessage.content,
              timestamp: Date.now(),
            };
            await emitter.emit({ type: 'message_start', message: eventMessage }, signal);
            await emitter.emit({ type: 'message_end', message: eventMessage }, signal);
          }
        }

        if (deps.shouldStopAfterTurn?.(assistantEventMsg, [], context)) break;
      }

      // 9. 保存对话
      if (deps.memory && params.sessionId) {
        try {
          const memoryScope = { tenantId, userId };
          await deps.memory.appendMessage(params.sessionId, memoryScope, { role: 'user', content: message });
          await deps.memory.appendMessage(params.sessionId, memoryScope, {
            role: 'assistant',
            content: fullContent,
          });
        } catch {
          /* 保存失败不影响返回 */
        }
      }

      await emitter.emit(
        {
          type: 'agent_end',
          messages: [{ role: 'assistant', content: fullContent, timestamp: Date.now() }],
        },
        signal,
      );

      runSpan?.setAttribute('iterations', iteration);
      runSpan?.setAttribute('output_chars', fullContent.length);
      runSpan?.setStatus('ok');
      } catch (error) {
        spanError(runSpan, error);
        throw error;
      } finally {
        runSpan?.end();
      }

      yield { type: 'done' };
    },
  };
}
