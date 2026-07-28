/**
 * Anthropic Provider (Claude)
 *
 * 支持 Messages API、流式输出、tool_use。
 * 适配 Anthropic 的非标准消息格式（system 独立于 messages）。
 */
import { aiErrors } from '../../errors';
import type {
  ChatParams,
  ChatResult,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamChunk,
  ToolCall,
} from '../types';

export interface AnthropicProviderConfig {
  name?: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  functionCalling: true,
  maxContextLength: 200000,
  supportsVision: true,
  supportsStreaming: true,
};

/**
 * 将标准 ChatMessage 转换为 Anthropic Messages API 格式
 * Anthropic 不接受 system 在 messages 中，需要单独处理
 */
function convertMessages(messages: ChatParams['messages']): {
  system: string | undefined;
  anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
  }>;
} {
  let system: string | undefined;
  const anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
  }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
      continue;
    }
    if (msg.role === 'tool') {
      // Anthropic 使用 tool_result 内容块
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          },
        ],
      });
      continue;
    }
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // 包含 tool_use 内容块
      const content: Array<Record<string, unknown>> = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      anthropicMessages.push({ role: 'assistant', content });
      continue;
    }
    anthropicMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  return { system, anthropicMessages };
}

function convertTools(tools: ChatParams['tools']): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  function buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': API_VERSION,
      ...config.headers,
    };
  }

  return {
    name: config.name ?? 'anthropic',
    capabilities: DEFAULT_CAPABILITIES,

    async chat(params: ChatParams): Promise<ChatResult> {
      const { system, anthropicMessages } = convertMessages(params.messages);
      const body: Record<string, unknown> = {
        model: params.model,
        messages: anthropicMessages,
        max_tokens: params.maxTokens ?? 4096,
      };
      if (system) body.system = system;
      if (params.temperature !== undefined) body.temperature = params.temperature;
      const tools = convertTools(params.tools);
      if (tools) body.tools = tools;

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal: params.signal,
      });

      if (!response.ok) {
        const _errBody = await response.text().catch(() => '');
        if (response.status === 429) throw aiErrors.llmRateLimited('anthropic');
        throw aiErrors.llmTimeout('anthropic');
      }

      const data = (await response.json()) as {
        content: Array<
          | { type: 'text'; text: string }
          | {
              type: 'tool_use';
              id: string;
              name: string;
              input: Record<string, unknown>;
            }
        >;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input,
          });
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        },
        finishReason:
          data.stop_reason === 'end_turn'
            ? 'stop'
            : data.stop_reason === 'tool_use'
              ? 'tool_calls'
              : data.stop_reason === 'max_tokens'
                ? 'length'
                : 'error',
      };
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const { system, anthropicMessages } = convertMessages(params.messages);
      const body: Record<string, unknown> = {
        model: params.model,
        messages: anthropicMessages,
        max_tokens: params.maxTokens ?? 4096,
        stream: true,
      };
      if (system) body.system = system;
      if (params.temperature !== undefined) body.temperature = params.temperature;
      const tools = convertTools(params.tools);
      if (tools) body.tools = tools;

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal: params.signal,
      });

      if (!response.ok) {
        yield {
          type: 'error',
          error: {
            code: 'ANTHROPIC_API_ERROR',
            message: `API error ${response.status}`,
            recoverable: response.status >= 500 || response.status === 429,
          },
        };
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentToolCall: {
        id: string;
        name: string;
        arguments: string;
      } | null = null;

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
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(data) as Record<string, unknown>;
            } catch {
              continue;
            }

            const eventType = parsed.type as string;

            if (eventType === 'content_block_start') {
              const block = parsed.content_block as Record<string, unknown>;
              if (block?.type === 'tool_use') {
                currentToolCall = {
                  id: block.id as string,
                  name: block.name as string,
                  arguments: '',
                };
              }
            } else if (eventType === 'content_block_delta') {
              const delta = parsed.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta') {
                yield { type: 'content', delta: delta.text as string };
              } else if (delta?.type === 'input_json_delta') {
                if (currentToolCall) {
                  currentToolCall.arguments += delta.partial_json as string;
                  yield {
                    type: 'tool_call_delta',
                    toolCallDelta: {
                      arguments: delta.partial_json as string,
                    },
                  };
                }
              }
            } else if (eventType === 'content_block_stop') {
              if (currentToolCall) {
                let args: Record<string, unknown>;
                try {
                  args = JSON.parse(currentToolCall.arguments) as Record<string, unknown>;
                } catch {
                  args = {};
                }
                yield {
                  type: 'tool_call_start',
                  toolCall: {
                    id: currentToolCall.id,
                    name: currentToolCall.name,
                    arguments: args,
                  },
                };
                currentToolCall = null;
              }
            } else if (eventType === 'message_delta') {
              const usage = parsed.usage as { output_tokens?: number } | undefined;
              if (usage?.output_tokens) {
                yield {
                  type: 'usage',
                  usage: {
                    promptTokens: 0,
                    completionTokens: usage.output_tokens,
                  },
                };
              }
            } else if (eventType === 'message_stop') {
              yield { type: 'done' };
              return;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      // Anthropic 没有 list models API，返回已知模型
      return [
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          contextLength: 200000,
          supportsFunctionCalling: true,
          supportsVision: true,
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          contextLength: 200000,
          supportsFunctionCalling: true,
          supportsVision: true,
        },
      ];
    },
  };
}
