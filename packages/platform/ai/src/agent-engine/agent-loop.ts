import type { KnowledgeBaseService } from '../knowledge-base/types';
import type { ChatMessage, LLMGateway, StreamChunk, ToolCall } from '../llm-gateway/types';
import type { MemoryService } from '../memory/types';
import type { ToolRegistry } from '../tool-registry';
import type { AgentEventEmitter, AgentEventMessage } from './events';
import { createEventEmitter } from './events';
import { fitMessagesToBudget } from './prompt-builder';
import { type PromptGuard, createPromptGuard } from './prompt-guard';
import { parseToolCalls } from './tool-call-handler';
import type {
  AgentContext,
  AgentLoopConfig,
  AgentTool,
  AgentToolResult,
  ToolExecutionMode,
} from './types';

// ---- 配置与依赖 ----

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
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
    requiresApproval: toolDef.requiresApproval,
    riskLevel: toolDef.riskLevel,
    timeout: toolDef.timeout,
  }));
}

// ---- 工具执行准备 ----

interface PreparedToolCall {
  kind: 'prepared';
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  tool: AgentTool;
  args: unknown;
}

interface ImmediateResult {
  kind: 'immediate';
  result: AgentToolResult;
  isError: boolean;
}

type PrepareResult = PreparedToolCall | ImmediateResult;

async function prepareToolCall(
  _context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCall: { id: string; name: string; arguments: Record<string, unknown> },
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
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

    // beforeToolCall 钩子
    if (beforeToolCall) {
      const hookResult = await beforeToolCall({ assistantMessage, toolCall, args }, signal);
      if (hookResult.skip) {
        return {
          kind: 'immediate',
          result: createErrorToolResult(hookResult.reason ?? 'Tool call skipped by hook'),
          isError: false,
        };
      }
    }

    return {
      kind: 'prepared',
      toolCall,
      tool,
      args,
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
}

async function executeToolCallsSequential(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
  afterToolCall: AgentLoopConfig['afterToolCall'],
  _emit: (event: AgentEventMessage, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
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
      signal,
    );
    if (prepared.kind === 'immediate') {
      results.push({ toolCall: tc, result: prepared.result, durationMs: 0 });
      continue;
    }
    const { tool, args } = prepared;
    const start = Date.now();
    try {
      const result = await tool.execute(tc.id, args);
      const durationMs = Date.now() - start;
      results.push({ toolCall: tc, result, durationMs });
      if (afterToolCall) {
        await afterToolCall({ assistantMessage, toolCall: tc, result, durationMs }, signal);
      }
    } catch (err) {
      const durationMs = Date.now() - start;
      results.push({
        toolCall: tc,
        result: createErrorToolResult(
          `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
        durationMs,
      });
    }
  }
  return results;
}

async function executeToolCallsParallel(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig['beforeToolCall'],
  afterToolCall: AgentLoopConfig['afterToolCall'],
  _emit: (event: AgentEventMessage, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<FinalizedToolCall[]> {
  const results: FinalizedToolCall[] = [];
  const promises = toolCalls.map(async (tc) => {
    if (signal?.aborted) return;
    const prepared = await prepareToolCall(
      context,
      assistantMessage,
      tc,
      agentTools,
      beforeToolCall,
      signal,
    );
    if (prepared.kind === 'immediate') {
      results.push({ toolCall: tc, result: prepared.result, durationMs: 0 });
      return;
    }
    const { tool, args } = prepared;
    const start = Date.now();
    try {
      const result = await tool.execute(tc.id, args);
      const durationMs = Date.now() - start;
      results.push({ toolCall: tc, result, durationMs });
      if (afterToolCall) {
        await afterToolCall({ assistantMessage, toolCall: tc, result, durationMs }, signal);
      }
    } catch (err) {
      const durationMs = Date.now() - start;
      results.push({
        toolCall: tc,
        result: createErrorToolResult(
          `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
        durationMs,
      });
    }
  });
  await Promise.all(promises);
  return results;
}

// ---- 主循环 ----

export function createAgentLoop(deps: AgentLoopDeps): AgentLoop {
  const guard = deps.promptGuard ?? createPromptGuard();
  const emitter = deps.eventEmitter ?? createEventEmitter();
  const toolExecMode = deps.toolExecutionMode ?? 'sequential';

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

      const systemPrompt = agentConfig?.systemPrompt ?? '你是一个智能助手。';
      const model = agentConfig?.model ?? 'default';
      const maxIterations = agentConfig?.maxIterations ?? 10;

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
      let history: ChatMessage[] = [];
      if (deps.memory && params.sessionId) {
        try {
          history = await deps.memory.getHistory(params.sessionId, 20);
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
          const kbResults = await deps.knowledgeBase.search(message, {
            knowledgeBaseIds: params.knowledgeBaseIds ?? agentConfig.knowledgeBaseIds,
            limit: 3,
          });
          if (kbResults.length > 0) {
            kbContext = `\n\n参考知识库内容：\n${kbResults.map((r) => `- ${r.content}`).join('\n')}`;
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

      const context: AgentContext = { systemPrompt, messages, tools: agentTools };

      // 7. 工具定义
      const toolDefs =
        agentTools.length > 0
          ? agentTools.map((t) => ({
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
      await emitter.emit({ type: 'turn_start' }, signal);

      while (iteration < maxIterations) {
        iteration++;
        if (signal?.aborted) break;

        await emitter.emit(
          { type: 'before_provider_request', model, messageCount: messages.length },
          signal,
        );

        // Token 预算裁剪
        const trimmedMessages = fitMessagesToBudget(messages);

        // 调用 LLM
        const stream = deps.llmGateway.chatStream({
          model,
          tenantId,
          messages: trimmedMessages,
          tools: toolDefs,
          signal,
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
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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

        // 如果没有工具调用，循环结束
        if (toolCalls.length === 0) break;

        // 执行工具调用
        const parsed = parseToolCalls(toolCalls, deps.toolRegistry!);

        // 转换为 agent tool calls 格式
        const validToolCalls = parsed
          .filter((tc) => !tc.error)
          .map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.params }));

        // 错误的工具调用直接作为错误结果
        const errorResults = parsed.filter((tc) => tc.error);

        for (const errTc of errorResults) {
          messages.push({
            role: 'tool',
            tool_call_id: errTc.id,
            content: JSON.stringify({ error: true, message: errTc.error }),
          });
        }

        if (validToolCalls.length === 0) continue;

        // 执行工具
        let finalized: FinalizedToolCall[];
        if (toolExecMode === 'parallel') {
          finalized = await executeToolCallsParallel(
            context,
            assistantEventMsg,
            validToolCalls,
            agentTools,
            deps.beforeToolCall,
            deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s),
            signal,
          );
        } else {
          finalized = await executeToolCallsSequential(
            context,
            assistantEventMsg,
            validToolCalls,
            agentTools,
            deps.beforeToolCall,
            deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s),
            signal,
          );
        }

        // 将工具结果添加到消息
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
        }

        // 检查提前终止
        if (isEarlyTermination(finalized)) break;
      }

      // 9. 保存对话
      if (deps.memory && params.sessionId) {
        try {
          await deps.memory.appendMessage(params.sessionId, { role: 'user', content: message });
          await deps.memory.appendMessage(params.sessionId, {
            role: 'assistant',
            content: fullContent,
          });
        } catch {
          /* 保存失败不影响返回 */
        }
      }

      await emitter.emit(
        {
          type: 'turn_end',
          message: { role: 'assistant', content: fullContent, timestamp: Date.now() },
          toolResults: [],
        },
        signal,
      );
      await emitter.emit(
        {
          type: 'agent_end',
          messages: [{ role: 'assistant', content: fullContent, timestamp: Date.now() }],
        },
        signal,
      );

      yield { type: 'done' };
    },
  };
}
