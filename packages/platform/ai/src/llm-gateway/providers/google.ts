/**
 * Google Provider (Gemini)
 *
 * 支持 Gemini API (generateContent / streamGenerateContent)、
 * function calling、流式输出。
 */
import { aiErrors } from "../../errors";
import type {
  ChatParams,
  ChatResult,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamChunk,
  ToolCall,
} from "../types";

export interface GoogleProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  functionCalling: true,
  maxContextLength: 1048576,
  supportsVision: true,
  supportsStreaming: true,
};

/**
 * 将标准消息转换为 Gemini 格式
 */
function convertMessages(messages: ChatParams["messages"]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }>;
} {
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;
  const contents: Array<{
    role: string;
    parts: Array<Record<string, unknown>>;
  }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = { parts: [{ text: msg.content }] };
      continue;
    }
    if (msg.role === "tool") {
      contents.push({
        role: "function",
        parts: [
          {
            functionResponse: {
              name: msg.tool_call_id,
              response: { content: msg.content },
            },
          },
        ],
      });
      continue;
    }
    if (msg.role === "assistant" && msg.tool_calls?.length) {
      const parts: Array<Record<string, unknown>> = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments,
          },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  return { systemInstruction, contents };
}

function convertTools(
  tools: ChatParams["tools"],
): Record<string, unknown> | undefined {
  if (!tools?.length) return undefined;
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };
}

export function createGoogleProvider(
  config: GoogleProviderConfig,
): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: "google",
    capabilities: DEFAULT_CAPABILITIES,

    async chat(params: ChatParams): Promise<ChatResult> {
      const { systemInstruction, contents } = convertMessages(params.messages);
      const body: Record<string, unknown> = { contents };
      if (systemInstruction) body.systemInstruction = systemInstruction;
      if (params.temperature !== undefined)
        body.generationConfig = {
          temperature: params.temperature,
          ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        };
      const tools = convertTools(params.tools);
      if (tools) body.tools = [tools];

      const modelPath = params.model.includes("/")
        ? params.model.split("/").pop()
        : params.model;

      const response = await fetch(
        `${baseUrl}/v1beta/models/${modelPath}:generateContent?key=${config.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: params.signal,
        },
      );

      if (!response.ok) {
        if (response.status === 429) throw aiErrors.llmRateLimited("google");
        throw aiErrors.llmTimeout("google");
      }

      const data = (await response.json()) as {
        candidates: Array<{
          content: {
            parts: Array<
              | { text: string }
              | {
                  functionCall: {
                    name: string;
                    args: Record<string, unknown>;
                  };
                }
            >;
          };
          finishReason: string;
        }>;
        usageMetadata?: {
          promptTokenCount: number;
          candidatesTokenCount: number;
        };
      };

      const candidate = data.candidates?.[0];
      let content = "";
      const toolCalls: ToolCall[] = [];

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if ("text" in part) {
            content += part.text;
          } else if ("functionCall" in part) {
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args,
            });
          }
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        finishReason:
          candidate?.finishReason === "STOP"
            ? "stop"
            : candidate?.finishReason === "MAX_TOKENS"
              ? "length"
              : candidate?.finishReason === "TOOL_CALLS" ||
                  candidate?.finishReason === "TOOL_CALL"
                ? "tool_calls"
                : "error",
      };
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const { systemInstruction, contents } = convertMessages(params.messages);
      const body: Record<string, unknown> = { contents };
      if (systemInstruction) body.systemInstruction = systemInstruction;
      if (params.temperature !== undefined)
        body.generationConfig = {
          temperature: params.temperature,
          ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        };
      const tools = convertTools(params.tools);
      if (tools) body.tools = [tools];

      const modelPath = params.model.includes("/")
        ? params.model.split("/").pop()
        : params.model;

      const response = await fetch(
        `${baseUrl}/v1beta/models/${modelPath}:streamGenerateContent?alt=sse&key=${config.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: params.signal,
        },
      );

      if (!response.ok) {
        yield {
          type: "error",
          error: {
            code: "GOOGLE_API_ERROR",
            message: `API error ${response.status}`,
            recoverable: response.status >= 500 || response.status === 429,
          },
        };
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(data) as Record<string, unknown>;
            } catch {
              continue;
            }

            const candidates = parsed.candidates as
              | Array<{
                  content?: {
                    parts?: Array<
                      | { text?: string }
                      | {
                          functionCall?: {
                            name: string;
                            args: Record<string, unknown>;
                          };
                        }
                    >;
                  };
                  finishReason?: string;
                }>
              | undefined;
            const candidate = candidates?.[0];
            if (!candidate?.content?.parts) continue;

            for (const part of candidate.content.parts) {
              if ("text" in part && part.text) {
                yield { type: "content", delta: part.text };
              } else if ("functionCall" in part && part.functionCall) {
                yield {
                  type: "tool_call_start",
                  toolCall: {
                    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    name: part.functionCall.name,
                    arguments: part.functionCall.args,
                  },
                };
              }
            }

            const usageMeta = parsed.usageMetadata as
              | { promptTokenCount?: number; candidatesTokenCount?: number }
              | undefined;
            if (usageMeta) {
              yield {
                type: "usage",
                usage: {
                  promptTokens: usageMeta.promptTokenCount ?? 0,
                  completionTokens: usageMeta.candidatesTokenCount ?? 0,
                },
              };
            }

            if (candidate.finishReason) {
              yield { type: "done" };
              return;
            }
          }
        }
        yield { type: "done" };
      } finally {
        reader.releaseLock();
      }
    },

    async listModels(): Promise<ModelInfo[]> {
      try {
        const response = await fetch(
          `${baseUrl}/v1beta/models?key=${config.apiKey}`,
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
          models?: Array<{
            name: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }>;
        };
        return (data.models ?? [])
          .filter(
            (m) =>
              m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => ({
            id: m.name.replace("models/", ""),
            name: m.displayName ?? m.name,
            contextLength: 1048576,
            supportsFunctionCalling:
              m.supportedGenerationMethods?.includes("functionCalling") ??
              false,
            supportsVision: true,
          }));
      } catch {
        return [];
      }
    },
  };
}
