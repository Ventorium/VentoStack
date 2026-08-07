/** OpenAI Responses protocol Adapter, including streaming function calls. */
import type { ChatMessage, ChatParams, ChatResult, LLMProvider, ModelInfo, ProviderCapabilities, StreamChunk, ToolCall } from "../types";

export interface OpenAIResponsesProviderConfig {
  name?: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const CAPABILITIES: ProviderCapabilities = {
  functionCalling: true,
  maxContextLength: 200_000,
  supportsVision: true,
  supportsStreaming: true,
  supportsReasoning: true,
  supportsStructuredOutput: true,
};

function convertInput(messages: ChatMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
      continue;
    }
    if (message.content) input.push({ role: message.role, content: message.content });
    for (const call of message.tool_calls ?? []) {
      input.push({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) });
    }
  }
  return input;
}

function buildBody(params: ChatParams, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { model: params.model, input: convertInput(params.messages), stream };
  if (params.maxTokens !== undefined) body.max_output_tokens = params.maxTokens;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.thinkingLevel && params.thinkingLevel !== "off") body.reasoning = { effort: params.thinkingLevel };
  if (params.tools?.length) {
    body.tools = params.tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters }));
  }
  return body;
}

function buildHeaders(config: OpenAIResponsesProviderConfig, apiKey?: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey ?? config.apiKey}`, ...(config.headers ?? {}) };
}

function finishReason(status: string | undefined, hasTools: boolean): ChatResult["finishReason"] {
  if (hasTools) return "tool_calls";
  if (status === "incomplete") return "length";
  return status === "completed" ? "stop" : "error";
}

export function createOpenAIResponsesProvider(config: OpenAIResponsesProviderConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  return {
    name: config.name ?? "openai",
    capabilities: CAPABILITIES,

    async chat(params: ChatParams): Promise<ChatResult> {
      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: buildHeaders(config, params.apiKey),
        body: JSON.stringify(buildBody(params, false)),
        ...(params.signal ? { signal: params.signal } : {}),
      });
      if (!response.ok) throw new Error(`OpenAI Responses error ${response.status}`);
      const data = await response.json() as { status?: string; output?: Array<Record<string, unknown>>; usage?: { input_tokens?: number; output_tokens?: number } };
      let content = "";
      const toolCalls: ToolCall[] = [];
      for (const item of data.output ?? []) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const part of item.content as Array<Record<string, unknown>>) {
            if (part.type === "output_text" && typeof part.text === "string") content += part.text;
          }
        }
        if (item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string") {
          toolCalls.push({ id: item.call_id, name: item.name, arguments: typeof item.arguments === "string" ? JSON.parse(item.arguments) as Record<string, unknown> : {} });
        }
      }
      return {
        content,
        ...(toolCalls.length ? { toolCalls } : {}),
        usage: { promptTokens: data.usage?.input_tokens ?? 0, completionTokens: data.usage?.output_tokens ?? 0 },
        finishReason: finishReason(data.status, toolCalls.length > 0),
      };
    },

    async *chatStream(params: ChatParams): AsyncIterable<StreamChunk> {
      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: buildHeaders(config, params.apiKey),
        body: JSON.stringify(buildBody(params, true)),
        ...(params.signal ? { signal: params.signal } : {}),
      });
      if (!response.ok || !response.body) {
        yield { type: "error", error: { code: "OPENAI_RESPONSES_ERROR", message: `API error ${response.status}`, recoverable: response.status === 429 || response.status >= 500 } };
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          const event = JSON.parse(raw) as Record<string, unknown>;
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            yield { type: "content", delta: event.delta };
          } else if (event.type === "response.output_item.done") {
            const item = event.item as Record<string, unknown> | undefined;
            if (item?.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string") {
              yield { type: "tool_call_start", toolCall: { id: item.call_id, name: item.name, arguments: typeof item.arguments === "string" ? JSON.parse(item.arguments) as Record<string, unknown> : {} } };
            }
          } else if (event.type === "response.completed") {
            const completed = event.response as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
            if (completed?.usage) yield { type: "usage", usage: { promptTokens: completed.usage.input_tokens ?? 0, completionTokens: completed.usage.output_tokens ?? 0 } };
            yield { type: "done" };
            return;
          } else if (event.type === "response.failed") {
            yield { type: "error", error: { code: "OPENAI_RESPONSES_FAILED", message: "OpenAI Responses request failed", recoverable: false } };
            return;
          }
        }
      }
      yield { type: "done" };
    },

    async listModels(): Promise<ModelInfo[]> {
      const response = await fetch(`${baseUrl}/models`, { headers: buildHeaders(config) });
      if (!response.ok) return [];
      const data = await response.json() as { data?: Array<{ id: string }> };
      return (data.data ?? []).map((model) => ({ id: model.id, name: model.id, contextLength: CAPABILITIES.maxContextLength, supportsFunctionCalling: true, supportsVision: true }));
    },
  };
}
