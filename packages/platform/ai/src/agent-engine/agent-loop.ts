/**
 * Agent 执行循环 — 增强版
 *
 * 对齐参考实现的 agent-loop 架构：
 * - Before/After tool call 钩子
 * - 顺序/并行工具执行模式
 * - 工具流式部分结果更新
 * - 完整生命周期事件发射
 * - Steering/Follow-up 消息队列
 * - Tool argument 校验 + prepareArguments
 */
import { aiErrors } from "../errors";
import type {
  ChatMessage,
  LLMGateway,
  StreamChunk,
  ToolCall,
} from "../llm-gateway/types";
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { MemoryService } from "../memory/types";
import type { ToolRegistry } from "../tool-registry";
import { fitMessagesToBudget } from "./prompt-builder";
import { createPromptGuard, type PromptGuard } from "./prompt-guard";
import { parseToolCalls } from "./tool-call-handler";
import type { AgentEventEmitter, AgentEventMessage } from "./events";
import { createEventEmitter } from "./events";
import type {
  AgentContext,
  AgentLoopConfig,
  AgentRunParams,
  AgentTool,
  AgentToolResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
  AfterToolCallContext,
  AfterToolCallResult,
  ChatMessage as AgentChatMessage,
  ToolExecutionMode,
} from "./types";

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

export interface AgentLoopDeps {
  llmGateway: LLMGateway;
  toolRegistry?: ToolRegistry;
  knowledgeBase?: KnowledgeBaseService;
  memory?: MemoryService;
  promptGuard?: PromptGuard;
  eventEmitter?: AgentEventEmitter;
  /** Agent 级别的 tools（增强版，支持 hooks） */
  agentTools?: AgentTool[];
  /** beforeToolCall 钩子 */
  beforeToolCall?: AgentLoopConfig["beforeToolCall"];
  /** afterToolCall 钩子 */
  afterToolCall?: AgentLoopConfig["afterToolCall"];
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
}

export interface AgentLoop {
  runStream(params: AgentRunParams): AsyncIterable<StreamChunk>;
}

// ---- 辅助函数 ----

function createErrorToolResult(message: string): AgentToolResult {
  return {
    content: [{ type: "text", text: message }],
    details: {},
  };
}

function isEarlyTermination(
  finalizedCalls: Array<{ result: AgentToolResult }>,
): boolean {
  return (
    finalizedCalls.length > 0 &&
    finalizedCalls.every((f) => f.result.terminate === true)
  );
}

/** 从 ToolRegistry 包装为 AgentTool[] */
function wrapRegistryTools(registry: ToolRegistry): AgentTool[] {
  return registry.list().map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    parameters: {
      type: "object" as const,
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
        content: [{ type: "text" as const, text: typeof result.result === "string" ? result.result : JSON.stringify(result.result ?? result.error ?? "") }],
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
  kind: "prepared";
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  tool: AgentTool;
  args: unknown;
}

interface ImmediateResult {
  kind: "immediate";
  result: AgentToolResult;
  isError: boolean;
}

type PrepareResult = PreparedToolCall | ImmediateResult;

async function prepareToolCall(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCall: { id: string; name: string; arguments: Record<string, unknown> },
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig["beforeToolCall"],
  signal?: AbortSignal,
): Promise<PrepareResult> {
  const tool = agentTools.find((t) => t.name === toolCall.name);
  if (!tool) {
    return {
      kind: "immediate",
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
      const hookResult = await beforeToolCall(
        { assistantMessage, toolCall, args, context },
        signal,
      );
      if (signal?.aborted) {
        return {
          kind: "immediate",
          result: createErrorToolResult("Operation aborted"),
          isError: true,
        };
      }
      if (hookResult?.block) {
        return {
          kind: "immediate",
          result: createErrorToolResult(
            hookResult.reason || "Tool execution was blocked",
          ),
          isError: true,
        };
      }
    }

    if (signal?.aborted) {
      return {
        kind: "immediate",
        result: createErrorToolResult("Operation aborted"),
        isError: true,
      };
    }

    return { kind: "prepared", toolCall, tool, args };
  } catch (error) {
    return {
      kind: "immediate",
      result: createErrorToolResult(
        error instanceof Error ? error.message : String(error),
      ),
      isError: true,
    };
  }
}

// ---- 工具执行 ----

interface ExecutedToolCall {
  result: AgentToolResult;
  isError: boolean;
}

async function executePreparedToolCall(
  prepared: PreparedToolCall,
  signal: AbortSignal | undefined,
  onToolUpdate?: (event: {
    toolCallId: string;
    toolName: string;
    partialResult: AgentToolResult;
  }) => void,
): Promise<ExecutedToolCall> {
  try {
    const result = await prepared.tool.execute(
      prepared.toolCall.id,
      prepared.args as Record<string, unknown>,
      signal,
      onToolUpdate
        ? (partialResult) =>
            onToolUpdate({
              toolCallId: prepared.toolCall.id,
              toolName: prepared.toolCall.name,
              partialResult,
            })
        : undefined,
    );
    return { result, isError: false };
  } catch (error) {
    return {
      result: createErrorToolResult(
        error instanceof Error ? error.message : String(error),
      ),
      isError: true,
    };
  }
}

// ---- 工具结果后处理 ----

interface FinalizedToolCall {
  toolCall: { id: string; name: string; arguments: Record<string, unknown> };
  result: AgentToolResult;
  isError: boolean;
}

async function finalizeToolCall(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  prepared: PreparedToolCall,
  executed: ExecutedToolCall,
  afterToolCall: AgentLoopConfig["afterToolCall"],
  signal?: AbortSignal,
): Promise<FinalizedToolCall> {
  let result = executed.result;
  let isError = executed.isError;

  if (afterToolCall) {
    try {
      const afterResult = await afterToolCall(
        {
          assistantMessage,
          toolCall: prepared.toolCall,
          args: prepared.args,
          result,
          isError,
          context,
        },
        signal,
      );
      if (afterResult) {
        result = {
          content: afterResult.content ?? result.content,
          details: afterResult.details ?? result.details,
          terminate: afterResult.terminate ?? result.terminate,
        };
        isError = afterResult.isError ?? isError;
      }
    } catch (error) {
      result = createErrorToolResult(
        error instanceof Error ? error.message : String(error),
      );
      isError = true;
    }
  }

  return { toolCall: prepared.toolCall, result, isError };
}

// ---- 顺序执行工具 ----

async function executeToolCallsSequential(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig["beforeToolCall"],
  afterToolCall: AgentLoopConfig["afterToolCall"],
  emit: (event: import("./events").AgentEvent, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<FinalizedToolCall[]> {
  const finalized: FinalizedToolCall[] = [];

  for (const tc of toolCalls) {
    const prepared = await prepareToolCall(
      context, assistantMessage, tc, agentTools, beforeToolCall, signal,
    );

    if (prepared.kind === "immediate") {
      finalized.push({ toolCall: tc, result: prepared.result, isError: prepared.isError });
      await emit({ type: "tool_execution_end", toolCallId: tc.id, toolName: tc.name, result: prepared.result, isError: prepared.isError }, signal);
      continue;
    }

    await emit({ type: "tool_execution_start", toolCallId: tc.id, toolName: tc.name, args: tc.arguments }, signal);

    const executed = await executePreparedToolCall(prepared, signal, async (update) => {
      await emit({ type: "tool_execution_update", toolCallId: update.toolCallId, toolName: update.toolName, args: tc.arguments, partialResult: update.partialResult }, signal);
    });

    const fin = await finalizeToolCall(context, assistantMessage, prepared, executed, afterToolCall, signal);
    finalized.push(fin);

    await emit({ type: "tool_execution_end", toolCallId: fin.toolCall.id, toolName: fin.toolCall.name, result: fin.result, isError: fin.isError }, signal);

    if (fin.result.terminate) break;
  }

  return finalized;
}

// ---- 并行执行工具 ----

async function executeToolCallsParallel(
  context: AgentContext,
  assistantMessage: AgentEventMessage,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  agentTools: AgentTool[],
  beforeToolCall: AgentLoopConfig["beforeToolCall"],
  afterToolCall: AgentLoopConfig["afterToolCall"],
  emit: (event: import("./events").AgentEvent, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<FinalizedToolCall[]> {
  // 准备阶段（顺序）
  const preparations: Array<{
    tc: { id: string; name: string; arguments: Record<string, unknown> };
    prepared: PrepareResult;
  }> = [];

  for (const tc of toolCalls) {
    const prepared = await prepareToolCall(
      context, assistantMessage, tc, agentTools, beforeToolCall, signal,
    );
    preparations.push({ tc, prepared });

    if (prepared.kind === "immediate") {
      await emit({ type: "tool_execution_start", toolCallId: tc.id, toolName: tc.name, args: tc.arguments }, signal);
    }
  }

  // 执行阶段（并行）
  const executionPromises = preparations.map(async ({ tc, prepared }) => {
    if (prepared.kind === "immediate") {
      await emit({ type: "tool_execution_end", toolCallId: tc.id, toolName: tc.name, result: prepared.result, isError: prepared.isError }, signal);
      return { toolCall: tc, result: prepared.result, isError: prepared.isError };
    }

    await emit({ type: "tool_execution_start", toolCallId: tc.id, toolName: tc.name, args: tc.arguments }, signal);

    const executed = await executePreparedToolCall(prepared, signal, async (update) => {
      await emit({ type: "tool_execution_update", toolCallId: update.toolCallId, toolName: update.toolName, args: tc.arguments, partialResult: update.partialResult }, signal);
    });

    const fin = await finalizeToolCall(context, assistantMessage, prepared, executed, afterToolCall, signal);

    await emit({ type: "tool_execution_end", toolCallId: fin.toolCall.id, toolName: fin.toolCall.name, result: fin.result, isError: fin.isError }, signal);

    return fin;
  });

  return Promise.all(executionPromises);
}

// ---- 主循环 ----

export function createAgentLoop(deps: AgentLoopDeps): AgentLoop {
  const guard = deps.promptGuard ?? createPromptGuard();
  const emitter = deps.eventEmitter ?? createEventEmitter();
  const agentTools = deps.agentTools ?? (deps.toolRegistry ? wrapRegistryTools(deps.toolRegistry) : []);
  const toolExecMode = deps.toolExecutionMode ?? "sequential";

  return {
    async *runStream(params: AgentRunParams): AsyncIterable<StreamChunk> {
      const { message, tenantId, userId, signal } = params;

      // 1. 输入安全检查
      const inputCheck = guard.checkInput(message);
      if (!inputCheck.safe && inputCheck.level === "blocked") {
        await emitter.emit({ type: "error", error: { code: "AI_PROMPT_INJECTION", message: inputCheck.reason ?? "检测到不安全的输入", recoverable: false } }, signal);
        yield { type: "error", error: { code: "AI_PROMPT_INJECTION", message: inputCheck.reason ?? "检测到不安全的输入", recoverable: false } };
        return;
      }

      // 2. 加载对话历史
      let history: ChatMessage[] = [];
      if (deps.memory && params.sessionId) {
        try { history = await deps.memory.getHistory(params.sessionId, 20); } catch { /* 失败则以空历史继续 */ }
      }

      // 3. 组装消息
      const messages: ChatMessage[] = [
        { role: "system", content: "你是一个智能助手。" },
        ...history,
        { role: "user", content: message },
      ];

      const context: AgentContext = { systemPrompt: "你是一个智能助手。", messages, tools: agentTools };

      // 4. 工具定义
      const toolDefs = agentTools.length > 0
        ? agentTools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as { type: "object"; properties: Record<string, unknown>; required?: string[] },
          }))
        : undefined;

      // 5. Agent 循环
      const maxIterations = 10;
      let iteration = 0;
      let fullContent = "";

      await emitter.emit({ type: "agent_start" }, signal);
      await emitter.emit({ type: "turn_start" }, signal);

      while (iteration < maxIterations) {
        iteration++;
        if (signal?.aborted) break;

        await emitter.emit({ type: "before_provider_request", model: "default", messageCount: messages.length }, signal);

        // Token 预算裁剪
        const trimmedMessages = fitMessagesToBudget(messages);

        // 调用 LLM
        const stream = deps.llmGateway.chatStream({
          model: "default",
          messages: trimmedMessages,
          tools: toolDefs,
          signal,
        });

        let assistantContent = "";
        const toolCalls: ToolCall[] = [];

        for await (const chunk of stream) {
          switch (chunk.type) {
            case "content":
              assistantContent += chunk.delta ?? "";
              fullContent += chunk.delta ?? "";
              yield chunk;
              break;
            case "tool_call_start":
              if (chunk.toolCall) toolCalls.push(chunk.toolCall);
              yield chunk;
              break;
            case "tool_call_delta":
              yield chunk;
              break;
            case "usage":
              yield chunk;
              break;
            case "error":
              yield chunk;
              return;
            case "done":
              break;
          }
        }

        // 构建 assistant 消息
        const assistantEventMsg: AgentEventMessage = {
          role: "assistant",
          content: assistantContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          timestamp: Date.now(),
        };

        // 保存 assistant 消息
        const assistantChatMsg: ChatMessage = {
          role: "assistant",
          content: assistantContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
        messages.push(assistantChatMsg);

        await emitter.emit({ type: "message_start", message: assistantEventMsg }, signal);
        await emitter.emit({ type: "message_end", message: assistantEventMsg }, signal);

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
            role: "tool",
            tool_call_id: errTc.id,
            content: JSON.stringify({ error: true, message: errTc.error }),
          });
        }

        if (validToolCalls.length === 0) continue;

        // 执行工具
        let finalized: FinalizedToolCall[];
        if (toolExecMode === "parallel") {
          finalized = await executeToolCallsParallel(
            context, assistantEventMsg, validToolCalls, agentTools,
            deps.beforeToolCall, deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s), signal,
          );
        } else {
          finalized = await executeToolCallsSequential(
            context, assistantEventMsg, validToolCalls, agentTools,
            deps.beforeToolCall, deps.afterToolCall,
            (ev, s) => emitter.emit(ev, s), signal,
          );
        }

        // 将工具结果添加到消息
        for (const fin of finalized) {
          const resultStr = fin.result.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          // 输出安全检查
          if (fin.toolCall.name.startsWith("fs-") || fin.toolCall.name.startsWith("kb-")) {
            const outputCheck = guard.checkOutput(resultStr, context.systemPrompt);
            if (!outputCheck.safe) {
              messages.push({
                role: "tool",
                tool_call_id: fin.toolCall.id,
                content: JSON.stringify({ error: true, message: "工具输出被安全策略拦截" }),
              });
              continue;
            }
          }

          // 截断工具结果
          const truncated = resultStr.length > 8000
            ? resultStr.slice(0, 8000) + "\n...[结果已截断]"
            : resultStr;

          messages.push({
            role: "tool",
            tool_call_id: fin.toolCall.id,
            content: truncated,
          });
        }

        // 检查提前终止
        if (isEarlyTermination(finalized)) break;
      }

      // 6. 保存对话
      if (deps.memory && params.sessionId) {
        try {
          await deps.memory.appendMessage(params.sessionId, { role: "user", content: message });
          await deps.memory.appendMessage(params.sessionId, { role: "assistant", content: fullContent });
        } catch { /* 保存失败不影响返回 */ }
      }

      await emitter.emit({ type: "turn_end", message: { role: "assistant", content: fullContent, timestamp: Date.now() }, toolResults: [] }, signal);
      await emitter.emit({ type: "agent_end", messages: [{ role: "assistant", content: fullContent, timestamp: Date.now() }] }, signal);

      yield { type: "done" };
    },
  };
}
