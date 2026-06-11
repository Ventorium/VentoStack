/**
 * OpenAI Provider
 * 支持 chat 和 chatStream，处理 tool_calls 增量拼接
 */
import { aiErrors } from "../../errors";
import type {
  ChatParams,
  ChatResult,
  LLMProvider,
  ModelInfo,
  OpenAIProviderConfig,
  ProviderCapabilities,
  StreamChunk,
  ToolCall,
} from "../types";

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  functionCalling: true,
  maxContextLength: 128000,
  supportsVision: true,
  supportsStreaming: true,
};

export function createOpenAIProvider(
  config: OpenAIProviderConfig,
): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: "openai",
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
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw aiErrors.llmTimeout("openai");
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
      const toolCalls = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<
          string,
          unknown
        >,
      }));

      return {
        content: choice.message.content ?? "",
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        },
        finishReason:
          choice.finish_reason === "tool_calls"
            ? "tool_calls"
            : choice.finish_reason === "length"
              ? "length"
              : choice.finish_reason === "stop"
                ? "stop"
                : "error",
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
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: params.signal,
      });

      if (!response.ok) {
        yield {
          type: "error",
          error: {
            code: "OPENAI_API_ERROR",
            message: `API error ${response.status}`,
            recoverable: response.status >= 500 || response.status === 429,
          },
        };
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;
            if (!trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              if (currentToolCall) {
                yield {
                  type: "tool_call_start",
                  toolCall: {
                    id: currentToolCall.id,
                    name: currentToolCall.name,
                    arguments: JSON.parse(currentToolCall.arguments) as Record<
                      string,
                      unknown
                    >,
                  },
                };
                currentToolCall = null;
              }
              yield { type: "done" };
              return;
            }

            let parsed: {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
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
                type: "usage",
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
              yield { type: "content", delta: choice.delta.content };
            }

            // 处理 tool calls
            if (choice.delta?.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                if (tc.id) {
                  if (currentToolCall) {
                    yield {
                      type: "tool_call_start",
                      toolCall: {
                        id: currentToolCall.id,
                        name: currentToolCall.name,
                        arguments: JSON.parse(
                          currentToolCall.arguments,
                        ) as Record<string, unknown>,
                      },
                    };
                  }
                  currentToolCall = {
                    id: tc.id,
                    name: tc.function?.name ?? "",
                    arguments: "",
                  };
                  if (tc.function?.name) {
                    currentToolCall.name = tc.function.name;
                  }
                }
                if (tc.function?.arguments) {
                  currentToolCall!.arguments += tc.function.arguments;
                  yield {
                    type: "tool_call_delta",
                    toolCallDelta: { arguments: tc.function.arguments },
                  };
                }
              }
            }

            // 处理 finish_reason
            if (
              choice.finish_reason === "tool_calls" &&
              currentToolCall
            ) {
              yield {
                type: "tool_call_start",
                toolCall: {
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  arguments: JSON.parse(currentToolCall.arguments) as Record<
                    string,
                    unknown
                  >,
                },
              };
              currentToolCall = null;
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
        supportsVision: m.id.includes("vision") || m.id.includes("gpt-4o"),
      }));
    },
  };
}
