/**
 * OpenAI Provider
 * 支持 chat 和 chatStream，处理 tool_calls 增量拼接
 */
import { aiErrors } from '../../errors';
import type {
  ChatParams,
  ChatResult,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamChunk,
} from '../types';

export interface OpenAIProviderConfig {
  name?: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  functionCalling: true,
  maxContextLength: 128000,
  supportsVision: true,
  supportsStreaming: true,
  supportsReasoning: true,
  supportsStructuredOutput: true,
};

function applyThinking(body: Record<string, unknown>, params: ChatParams): void {
  if (params.thinkingLevel && params.thinkingLevel !== 'off') {
    // OpenAI reasoning_effort 仅接受 low/medium/high；将 minimal 视为 low、xhigh 视为 high
    const effort =
      params.thinkingLevel === 'minimal' ? 'low'
      : params.thinkingLevel === 'xhigh' ? 'high'
      : params.thinkingLevel;
    body.reasoning_effort = effort;
  }
}

export function createOpenAIProvider(config: OpenAIProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: config.name ?? 'openai',
    capabilities: DEFAULT_CAPABILITIES,

    async chat(params: ChatParams): Promise<ChatResult> {
      const body: Record<string, unknown> = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: false,
      };
      if (params.tools?.length) {
        body.tools = params.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }
      applyThinking(body, params);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey ?? config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify(body),
        ...(params.signal ? { signal: params.signal } : {}),
      });

      if (!response.ok) {
        const _errBody = await response.text().catch(() => '');
        // 429 限流单独映射，供 retry.ts 走 Retry-After 指数退避；其余错误保持 5xx 语义
        if (response.status === 429) throw aiErrors.llmRateLimited('openai');
        throw aiErrors.llmTimeout('openai');
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      const choice = data.choices[0];
      if (!choice) throw new Error('OpenAI returned no choices');
      const toolCalls = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

      return {
        content: choice.message.content ?? '',
        ...(toolCalls?.length ? { toolCalls } : {}),
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        },
        finishReason:
          choice.finish_reason === 'tool_calls'
            ? 'tool_calls'
            : choice.finish_reason === 'length'
              ? 'length'
              : choice.finish_reason === 'stop'
                ? 'stop'
                : 'error',
      };
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const body: Record<string, unknown> = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      };
      if (params.tools?.length) {
        body.tools = params.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }
      applyThinking(body, params);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.apiKey ?? config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify(body),
        ...(params.signal ? { signal: params.signal } : {}),
      });

      if (!response.ok) {
        yield {
          type: 'error',
          error: {
            code: 'OPENAI_API_ERROR',
            message: `API error ${response.status}`,
            recoverable: response.status >= 500 || response.status === 429,
          },
        };
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const currentToolCalls = new Map<number, {
        id: string;
        name: string;
        arguments: string;
      }>();

      function toToolCall(call: { id: string; name: string; arguments: string }) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments || '{}') as Record<string, unknown>;
        } catch {
          // Invalid arguments are surfaced to the AgentTool schema validator.
        }
        return { id: call.id, name: call.name, arguments: args };
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              for (const [, currentToolCall] of [...currentToolCalls].sort(([left], [right]) => left - right)) {
                yield {
                  type: 'tool_call_start',
                  toolCall: toToolCall(currentToolCall),
                };
              }
              currentToolCalls.clear();
              yield { type: 'done' };
              return;
            }

            let parsed: {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string;
              }>;
              usage?: { prompt_tokens: number; completion_tokens: number };
            };
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            // 处理 usage
            if (parsed.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                },
              };
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            // 处理内容 delta
            if (choice.delta?.content) {
              yield { type: 'content', delta: choice.delta.content };
            }

            // 处理 tool calls
            if (choice.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                const index = tc.index ?? 0;
                if (tc.id) {
                  currentToolCalls.set(index, {
                    id: tc.id,
                    name: tc.function?.name ?? '',
                    arguments: '',
                  });
                }
                const currentToolCall = currentToolCalls.get(index);
                if (tc.function?.name && currentToolCall) currentToolCall.name = tc.function.name;
                if (tc.function?.arguments) {
                  if (currentToolCall) currentToolCall.arguments += tc.function.arguments;
                  yield {
                    type: 'tool_call_delta',
                    toolCallDelta: {
                      ...(currentToolCall ? { id: currentToolCall.id, name: currentToolCall.name } : {}),
                      arguments: tc.function.arguments,
                    },
                  };
                }
              }
            }

            // 处理 finish_reason
            if (choice.finish_reason === 'tool_calls') {
              for (const [, currentToolCall] of [...currentToolCalls].sort(([left], [right]) => left - right)) {
                yield { type: 'tool_call_start', toolCall: toToolCall(currentToolCall) };
              }
              currentToolCalls.clear();
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as {
        data: Array<{ id: string; name?: string }>;
      };
      return data.data.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: 128000,
        supportsFunctionCalling: true,
        supportsVision: m.id.includes('vision') || m.id.includes('gpt-4o'),
      }));
    },
  };
}
