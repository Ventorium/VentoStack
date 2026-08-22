import type { KnowledgeBaseService } from '../knowledge-base/types';
import type { ChatMessage, LLMGateway, LLMToolDefinition, ResearchStage, StreamChunk, ThinkingLevel, ToolCall } from '../llm-gateway/types';
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

/** Agent 记忆配置（对应 ai_agent.memory_config 列） */
export interface MemoryConfig {
  /** 对话记忆开关：读写会话历史，默认开启 */
  enabled?: boolean;
  /** 长期记忆开关：读入用户级长记忆，默认关闭 */
  longTerm?: boolean;
  /** 单次加载的最大历史消息数（默认 20） */
  maxHistoryMessages?: number;
}

/** 深度研究模式配置（对应 ai_agent.config.research） */
export type ResearchDepth = 'quick' | 'normal' | 'deep';

export interface ResearchConfig {
  /** 探索强度：快速 / 常规 / 深度 */
  depth?: ResearchDepth;
  /** 主循环最大迭代轮数（覆盖深度预设，默认取 RESEARCH_DEPTH_MAP） */
  maxIterations?: number;
  /** 单轮生成 Token 上限（覆盖深度预设） */
  maxTokensPerTurn?: number;
  /** 每轮检索/搜索次数提示（注入 system prompt，覆盖深度预设） */
  searchCount?: number;
  /** 并行子任务数量上限（默认 6） */
  maxSubtasks?: number;
  /** 每个子任务的最大轮数（默认 4） */
  maxSubtaskTurns?: number;
}

/** 各探索强度对应的计算预算与检索强度 */
export const RESEARCH_DEPTH_MAP: Record<
  ResearchDepth,
  { maxIterations: number; maxTokensPerTurn: number; searchCount: number }
> = {
  quick: { maxIterations: 6, maxTokensPerTurn: 2048, searchCount: 3 },
  normal: { maxIterations: 10, maxTokensPerTurn: 4096, searchCount: 5 },
  deep: { maxIterations: 20, maxTokensPerTurn: 8192, searchCount: 8 },
};

/** 迭代轮数硬上限：无论 Agent 配置如何，单次运行不超过此轮数（防止成本放大攻击） */
export const AGENT_MAX_ITERATIONS_LIMIT = 50;
/** 单轮生成 Token 硬上限 */
export const AGENT_MAX_TOKENS_PER_TURN_LIMIT = 100_000;
/** 深度研究并行子任务数量上限 */
export const MAX_RESEARCH_SUBTASKS = 10;
/** 深度研究单个子任务最大轮数上限 */
export const MAX_RESEARCH_SUBTASK_TURNS = 8;

const RESEARCH_DEPTH_LABEL: Record<ResearchDepth, string> = {
  quick: '快速探索',
  normal: '常规研究',
  deep: '深度研究',
};

/** 子任务研究员允许使用的工具（web 检索 + 知识库自主检索） */
const RESEARCH_SUBTASK_TOOLS = [
  'web_search',
  'web_fetch',
  'kb-browse',
  'kb-search',
  'kb-read',
  'kb-follow-link',
  'kb-outline',
];

/** 研究方法论提示词：注入 system prompt，指导 LLM 按 规划→并行子任务→综合 执行 */
export function buildResearchPrompt(depth: ResearchDepth, searchCount?: number): string {
  return [
    `## 深度研究模式（${RESEARCH_DEPTH_LABEL[depth]}）`,
    '系统会为你的研究执行并行子任务。请严格遵循以下流程：',
    '1. 规划：第一轮输出研究计划，仅输出一个 JSON 数组（不要输出任何其它内容），列出 3-6 个待研究的子问题，例如：',
    '   ["子问题1", "子问题2", "子问题3"]',
    `2. 系统将每个子问题分配给独立研究员并行检索（使用 web_search / web_fetch / 知识库工具${
      searchCount ? `，每个子问题至少检索 ${searchCount} 轮关键词` : ''
    }）`,
    '3. 收到子任务结果后，综合交叉验证，识别矛盾信息与共识结论，标注可信度',
    '4. 产出：输出结构化研究报告（摘要 / 正文 / 结论），并列出引用的来源清单（来源名称 + URL）',
    '要求：优先使用官方文档、权威媒体与一手数据；对无法确认的信息明确标注"未能核实"。',
  ].join('\n');
}

/** 从规划轮输出中解析子问题 JSON 数组（支持 ```json 围栏，容错非纯 JSON 输出） */
export function parseSubtasks(content: string, maxSubtasks = 6): string[] {
  if (!content) return [];
  const fence = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  const candidate = fence?.[1] ?? content.match(/\[[\s\S]*?\]/)?.[0];
  if (!candidate) return [];
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, maxSubtasks);
    }
  } catch {
    /* 非 JSON，忽略 */
  }
  return [];
}

/** 并行子任务：独立研究员循环（子问题 → 检索 → 摘要 + 来源），最多 4 轮 */
async function runResearchSubtask(
  deps: AgentLoopDeps,
  options: {
    question: string;
    model: string;
    tenantId: string;
    userId: string;
    /** 主 Agent 的 id，用于子任务工具审计与审批上下文归属 */
    agentId?: string;
    toolNames: string[];
    signal?: AbortSignal;
    /** 按请求注入的工具注册表（KB 工具已绑定请求租户）；缺省使用 deps.toolRegistry */
    toolRegistry?: ToolRegistry;
    /** 子任务最大轮数（默认 4） */
    maxSubtaskTurns?: number;
  },
): Promise<{ question: string; summary: string; sources: string[] }> {
  const { question, model, tenantId, userId, agentId, toolNames, signal, toolRegistry } = options;
  const system = [
    '你是子问题研究员，负责独立研究一个子问题。',
    '步骤：先用 web_search 检索多个关键词，再用 web_fetch 阅读权威来源原文。',
    '最后输出：结论摘要（3-5 句话）+ 引用的来源 URL 列表（每行一个 URL，前缀"- "）。',
  ].join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];

  // 子任务与主循环共用同一工具执行管线：白名单包装 + 参数校验 + 钩子 + 审批授权，
  // 防止并行子任务成为绕过审批的后门
  const agentTools = toolRegistry ? wrapRegistryTools(toolRegistry, toolNames) : [];
  const subtaskContext: AgentContext = {
    agentId: agentId ?? 'research-subtask',
    userId,
    tenantId,
    systemPrompt: system,
    messages,
    tools: agentTools,
  };

  const tools: LLMToolDefinition[] = agentTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as LLMToolDefinition['parameters'],
  }));

  let fullContent = '';
  const sources: string[] = [];
  const maxSubtaskTurns = options.maxSubtaskTurns ?? 4;

  for (let i = 0; i < maxSubtaskTurns; i++) {
    if (signal?.aborted) break;
    const stream = deps.llmGateway.chatStream({
      model,
      tenantId,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(signal === undefined ? {} : { signal }),
    });

    let content = '';
    const toolCalls: ToolCall[] = [];
    for await (const chunk of stream) {
      if (chunk.type === 'content') content += chunk.delta ?? '';
      if (chunk.type === 'tool_call_start' && chunk.toolCall) toolCalls.push(chunk.toolCall);
      if (chunk.type === 'error') return { question, summary: fullContent.trim(), sources };
    }
    fullContent += content;

    if (toolCalls.length === 0 || agentTools.length === 0) break;

    // 先把带 tool_calls 的 assistant 消息写入对话，保证后续 tool 消息有配对的调用来源
    // （缺失会导致下一轮请求出现悬空 tool_call_id 被 provider 拒绝）
    messages.push({
      role: 'assistant',
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    const assistantEventMsg: AgentEventMessage = {
      role: 'assistant',
      content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      timestamp: Date.now(),
    };

    for (const tc of toolCalls) {
      if (signal?.aborted) break;
      // 与主循环一致的准备阶段：参数校验、beforeToolCall、requiresApproval 审批
      const prepared = await prepareToolCall(
        subtaskContext,
        assistantEventMsg,
        { id: tc.id, name: tc.name, arguments: (tc.arguments ?? {}) as Record<string, unknown> },
        agentTools,
        deps.beforeToolCall,
        deps.authorizeToolCall,
        signal,
      );

      let text = '';
      let status: 'success' | 'error' = 'success';
      let duration = 0;
      if (prepared.kind === 'immediate') {
        status = prepared.isError ? 'error' : 'success';
        text = prepared.result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
      } else {
        const finalized = await executePreparedToolCall(
          subtaskContext,
          assistantEventMsg,
          prepared,
          deps.afterToolCall,
          async () => {},
          signal,
          deps.tracer,
        );
        duration = finalized.durationMs;
        status = finalized.isError ? 'error' : 'success';
        text = finalized.result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
      }

      // 子任务工具调用同样写入审计（与主循环一致）
      if (deps.auditToolCall) {
        try {
          await deps.auditToolCall({
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments,
            output: { content: text.slice(0, 4000), isError: status === 'error' },
            status,
            duration,
            userId,
            tenantId,
          });
        } catch {
          /* 审计失败不影响研究 */
        }
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: text.slice(0, 4000) });
    }
  }

  // 提取来源 URL 去重
  const urlPattern = /https?:\/\/[^\s)"'<>]+/g;
  const matches = fullContent.match(urlPattern) ?? [];
  for (const url of matches) {
    if (!sources.includes(url)) sources.push(url);
  }

  return { question, summary: fullContent.trim(), sources };
}

/** 工具调用审计日志（写入 ai_tool_log 表） */
export interface AgentToolAuditLog {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  status: 'success' | 'error';
  duration: number;
  userId: string;
  tenantId: string;
  sessionId?: string;
}

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
  memoryConfig?: MemoryConfig;
  /** 深度研究模式配置（来自 ai_agent.config.research）；存在时启用多轮研究方法论 */
  research?: ResearchConfig;
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
   * 工具调用审计回调：每次工具执行完成后调用（含参数/结果/耗时/状态）。
   * 用于写入 ai_tool_log 审计表；回调抛错不会阻断主流程。
   */
  auditToolCall?: (log: AgentToolAuditLog) => Promise<void>;
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
  /** 按请求注入的工具注册表（KB 等租户相关工具已绑定请求 tenantId）；缺省使用 deps.toolRegistry */
  toolRegistry?: ToolRegistry;
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
  // filterTools 为 undefined 时返回全部；空数组表示默认拒绝（不暴露任何注册表工具）
  const filtered =
    filterTools === undefined
      ? allTools
      : allTools.filter((t) => filterTools.includes(t.name));

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
      // 工具注册表：支持按请求注入（KB 等租户相关工具绑定请求 tenantId），缺省使用 deps.toolRegistry
      const registry = params.toolRegistry ?? deps.toolRegistry;

      // 1. 获取 Agent 配置（配置了 agentService 时必须命中，失败/不存在一律拒绝运行）
      let agentConfig: AgentConfig | null = null;
      if (deps.agentService) {
        try {
          agentConfig = await deps.agentService.getById(agentId, tenantId);
        } catch (err) {
          console.error('Failed to fetch agent config:', err);
        }
        if (!agentConfig) {
          const notFound = {
            code: 'AGENT_NOT_FOUND' as const,
            message: `Agent ${agentId} 不存在或不可用`,
            recoverable: false,
          };
          await emitter.emit({ type: 'error', error: notFound }, signal);
          yield { type: 'error', error: notFound };
          return;
        }
      }

      let systemPrompt = params.systemPrompt ?? agentConfig?.systemPrompt ?? '你是一个智能助手。';
      let model = params.model ?? agentConfig?.model ?? 'default';
      // 硬封顶：Agent 配置的迭代/Token 预算不能超过平台上限（防成本放大）
      let maxIterations = Math.min(agentConfig?.maxIterations ?? 10, AGENT_MAX_ITERATIONS_LIMIT);
      let maxTokensPerTurn = agentConfig?.maxTokensPerTurn === undefined
        ? undefined
        : Math.min(agentConfig.maxTokensPerTurn, AGENT_MAX_TOKENS_PER_TURN_LIMIT);

      // 深度研究模式：探索强度决定计算预算，并注入研究方法论
      // 自定义预算（ResearchConfig 字段）覆盖深度预设，未配置时取 RESEARCH_DEPTH_MAP 默认值
      const researchConfig = agentConfig?.research ?? undefined;
      const researchMode = !!researchConfig?.depth && !!RESEARCH_DEPTH_MAP[researchConfig.depth];
      let subtasksRan = false;
      const allSources: string[] = [];
      if (researchMode) {
        const preset = RESEARCH_DEPTH_MAP[researchConfig!.depth!];
        maxIterations = Math.min(
          researchConfig!.maxIterations ?? preset.maxIterations,
          AGENT_MAX_ITERATIONS_LIMIT,
        );
        maxTokensPerTurn = Math.min(
          researchConfig!.maxTokensPerTurn ?? preset.maxTokensPerTurn,
          AGENT_MAX_TOKENS_PER_TURN_LIMIT,
        );
        const searchCount = researchConfig!.searchCount ?? preset.searchCount;
        systemPrompt = `${systemPrompt}\n\n${buildResearchPrompt(researchConfig!.depth!, searchCount)}`;
      }

      const skillIds = params.skillIds ?? agentConfig?.skillIds ?? [];
      if (deps.resolveSkills && skillIds.length > 0) {
        const skills = await deps.resolveSkills(skillIds, tenantId);
        if (skills.length > 0) {
          systemPrompt = `${systemPrompt}\n\n${skills.map((skill) => formatSkillInvocation(skill)).join("\n\n")}`;
        }
      }

      // 知识库自主检索引导（替代自动注入：Agent 需主动使用 kb-* 工具检索）
      const boundKbIds = params.knowledgeBaseIds ?? agentConfig?.knowledgeBaseIds ?? [];
      if (boundKbIds.length > 0) {
        systemPrompt = `${systemPrompt}\n\n## 知识库使用说明\n你已绑定 ${boundKbIds.length} 个知识库。回答涉及知识库内容的问题时，必须自主检索：先用 kb-browse / kb-outline 了解文档结构与标题大纲，再用 kb-search 定位相关内容，最后用 kb-read 阅读原文。禁止凭空回答知识库相关内容。`;
      }

      // 2. 根据 Agent 配置和过滤器获取工具（默认拒绝：Agent 未配置白名单时不暴露注册表工具）
      let agentTools = deps.agentTools ?? [];
      if (registry) {
        const agentToolNames = agentConfig?.tools ?? [];
        const requestFilter = params.tools ?? [];

        // 工具可用性 = Agent 配置白名单 ∩ 请求过滤器；白名单为空 = 无工具（请求不能单独扩权）
        const effectiveTools =
          requestFilter.length > 0 && agentToolNames.length > 0
            ? agentToolNames.filter((t) => requestFilter.includes(t))
            : agentToolNames;

        // 绑定知识库时自动启用知识库检索工具（租户级只读检索能力）
        const allowedTools = [...effectiveTools];
        if (boundKbIds.length > 0) {
          const kbToolNames = ['kb-browse', 'kb-search', 'kb-read', 'kb-follow-link', 'kb-outline'];
          for (const name of kbToolNames) {
            if (!allowedTools.includes(name)) allowedTools.push(name);
          }
        }

        agentTools = wrapRegistryTools(registry, allowedTools);
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

      // 4. 加载对话历史（tool 轨迹已持久化但不回放：tool 消息缺少 tool_call_id，回放会被 provider 拒绝；
      // 工具使用痕迹由 assistant 消息中的调用摘要保留）
      let history: ChatMessage[] = params.history ? [...params.history] : [];
      const memoryEnabled = agentConfig?.memoryConfig?.enabled !== false;
      if (!params.history && deps.memory && params.sessionId && memoryEnabled) {
        try {
          history = (await deps.memory.getHistory(
            params.sessionId,
            { tenantId, userId },
            agentConfig?.memoryConfig?.maxHistoryMessages ?? 20,
          )).flatMap((item) =>
            item.role === 'system' || item.role === 'user' || item.role === 'assistant'
              ? [{ role: item.role, content: item.content }]
              : [],
          );
        } catch (err) {
          console.error('[ai] 加载对话历史失败，以空历史继续:', err);
        }
      }

      /** 增量持久化对话消息（用户/assistant/工具轨迹），失败仅记录不阻断对话 */
      const persistMemoryMessage = async (msg: { role: string; content: string }): Promise<void> => {
        if (!deps.memory || !params.sessionId || !memoryEnabled) return;
        try {
          await deps.memory.appendMessage(params.sessionId, { tenantId, userId }, msg);
        } catch (err) {
          console.error('[ai] 持久化对话消息失败:', err);
        }
      };

      // 4.1 长期记忆注入（用户级，按 memory_config.longTerm 开关）
      if (agentConfig?.memoryConfig?.longTerm === true && deps.memory) {
        try {
          const memories = await deps.memory.listLongTermMemories({ tenantId, userId });
          if (memories.length > 0) {
            const memoryBlock = memories
              .slice(0, 5)
              .map((m) => `- ${m.title}: ${m.content.slice(0, 200)}`)
              .join('\n');
            systemPrompt = `${systemPrompt}\n\n用户长期记忆（可结合上下文使用）：\n${memoryBlock}`;
          }
        } catch (err) {
          console.error('[ai] 读取长期记忆失败:', err);
        }
      }

      // 6. 组装消息
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
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

      // 用户消息先行落盘：即使后续轮次中断也不丢失
      await persistMemoryMessage({ role: 'user', content: message });

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

      // 深度研究：规划轮产出子问题 → 并行子任务检索 → 注入结果并进入综合轮
      // 返回需要下发的 stage 事件（由生成器主体 yield）与是否继续进入综合轮
      async function runResearchStageIfNeeded(): Promise<{
        shouldContinue: boolean;
        stageEvents: Array<{ type: 'stage'; stage: ResearchStage }>;
      }> {
        if (!researchMode || subtasksRan) return { shouldContinue: false, stageEvents: [] };
        const maxSubtasks = Math.min(researchConfig?.maxSubtasks ?? 6, MAX_RESEARCH_SUBTASKS);
        const subtasks = parseSubtasks(fullContent, maxSubtasks);
        if (subtasks.length === 0) return { shouldContinue: false, stageEvents: [] };
        subtasksRan = true;

        const stageEvents: Array<{ type: 'stage'; stage: ResearchStage }> = [
          { type: 'stage', stage: 'researching' },
        ];
        const results = await Promise.all(
          subtasks.map((question) =>
            runResearchSubtask(deps, {
              question,
              model,
              tenantId,
              userId,
              ...(agentId ? { agentId } : {}),
              toolNames: RESEARCH_SUBTASK_TOOLS,
              signal,
              toolRegistry: registry,
              maxSubtaskTurns: Math.min(
                researchConfig?.maxSubtaskTurns ?? 4,
                MAX_RESEARCH_SUBTASK_TURNS,
              ),
            }),
          ),
        );

        const injected = results
          .map(
            (r, i) =>
              `### 子问题 ${i + 1}：${r.question}\n${r.summary}\n来源：\n${r.sources.map((s) => `- ${s}`).join('\n')}`,
          )
          .join('\n\n');
        messages.push({
          role: 'system',
          content: `以下是并行子任务的研究结果，请基于这些结果综合撰写最终报告，并在报告中列出来源清单。\n\n${injected}`,
        });

        for (const r of results) {
          for (const s of r.sources) {
            if (!allSources.includes(s)) allSources.push(s);
          }
        }

        stageEvents.push({ type: 'stage', stage: 'synthesizing' });
        return { shouldContinue: true, stageEvents };
      }

      while (iteration < maxIterations) {
        iteration++;
        if (signal?.aborted) break;
        // 深度研究：规划阶段（首轮）
        if (researchMode && iteration === 1) {
          yield { type: 'stage', stage: 'planning' };
        }
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
        // 运行时覆盖同样受硬封顶约束
        const effectiveMaxTokens = params.maxTokens !== undefined
          ? Math.min(params.maxTokens, AGENT_MAX_TOKENS_PER_TURN_LIMIT)
          : maxTokensPerTurn;
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

        // 增量持久化 assistant 消息（含工具调用摘要，跨轮/跨进程保留工具使用痕迹）
        await persistMemoryMessage({
          role: 'assistant',
          content:
            toolCalls.length > 0
              ? `${assistantContent}\n[工具调用: ${toolCalls.map((tc) => tc.name).join(', ')}]`
              : assistantContent,
        });

        await emitter.emit({ type: 'message_start', message: assistantEventMsg }, signal);
        await emitter.emit({ type: 'message_end', message: assistantEventMsg }, signal);

        // 如果没有工具调用，先处理 steering/follow-up，再决定是否结束
        if (toolCalls.length === 0) {
          await emitter.emit({ type: 'turn_end', message: assistantEventMsg, toolResults: [] }, signal);
          runSpan?.addEvent('ai.turn', { iteration, model, tool_calls: 0, output_chars: assistantContent.length });
          await applyPrepareNextTurn(assistantEventMsg, []);
          if (deps.shouldStopAfterTurn?.(assistantEventMsg, [], context)) break;

          // 深度研究：规划轮（无工具）→ 并行子任务 → 综合轮
          {
            const stage = await runResearchStageIfNeeded();
            for (const ev of stage.stageEvents) yield ev;
            if (stage.shouldContinue) continue;
          }

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

          // 工具审计（写入 ai_tool_log；失败不阻断主流程）
          if (deps.auditToolCall) {
            try {
              await deps.auditToolCall({
                toolCallId: fin.toolCall.id,
                toolName: fin.toolCall.name,
                input: fin.toolCall.arguments,
                output: { content: resultStr.slice(0, 4000), isError: fin.isError },
                status: fin.isError ? 'error' : 'success',
                duration: fin.durationMs,
                userId,
                tenantId,
                ...(params.sessionId ? { sessionId: params.sessionId } : {}),
              });
            } catch {
              /* 审计失败不影响对话 */
            }
          }

          // 输出安全检查（覆盖全部工具结果：web/MCP 等外部内容是间接注入与提示词泄露的主要通道）
          const outputCheck = guard.checkOutput(resultStr, context.systemPrompt);
          if (!outputCheck.safe) {
            messages.push({
              role: 'tool',
              tool_call_id: fin.toolCall.id,
              content: JSON.stringify({ error: true, message: '工具输出被安全策略拦截' }),
            });
            continue;
          }

          // 截断工具结果
          const truncated =
            resultStr.length > 8000 ? `${resultStr.slice(0, 8000)}\n...[结果已截断]` : resultStr;

          messages.push({
            role: 'tool',
            tool_call_id: fin.toolCall.id,
            content: truncated,
          });

          // 增量持久化工具结果（与 ai_tool_log 审计互补，保证会话内可追溯）
          await persistMemoryMessage({ role: 'tool', content: `[${fin.toolCall.name}] ${truncated}` });

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

        // 深度研究：规划轮（有工具）→ 并行子任务 → 综合轮
        {
          const stage = await runResearchStageIfNeeded();
          for (const ev of stage.stageEvents) yield ev;
          if (stage.shouldContinue) continue;
        }

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

      // 深度研究：下发引用来源清单（供前端渲染来源卡片）
      if (researchMode && allSources.length > 0) {
        yield {
          type: 'sources',
          sources: allSources.map((url) => ({ title: url, url })),
        };
      }

      // 9. 对话已在循环中增量持久化（用户消息先行落盘，assistant/工具轨迹逐轮写入），无需重复保存

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
