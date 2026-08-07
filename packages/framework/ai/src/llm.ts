/**
 * @ventostack/ai — LLM 客户端
 *
 * 轻量 OpenAI 兼容客户端，使用原生 fetch，零额外依赖。
 * 支持超时控制、温度、最大 token 数等参数。
 */

/** 聊天消息 */
export interface ChatMessage {
  /** 消息角色 */
  role: "system" | "user" | "assistant";
  /** 消息内容 */
  content: string;
}

/** LLM 客户端选项 */
export interface LLMClientOptions {
  /** API 密钥 */
  apiKey: string;
  /** API 基础 URL，默认 https://api.openai.com/v1 */
  baseURL?: string;
  /** 模型名称 */
  model: string;
  /** 请求超时（毫秒），默认 30_000 */
  timeout?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 温度参数（0 ~ 2），默认 0.7 */
  temperature?: number;
}

/** LLM 客户端 */
export interface LLMClient {
  /** 发起对话请求 */
  chat(messages: ChatMessage[]): Promise<string>;
}

/** 默认超时：30 秒 */
const DEFAULT_TIMEOUT = 30_000;
/** 默认温度：0.7 */
const DEFAULT_TEMPERATURE = 0.7;

/**
 * 创建 LLM 客户端实例
 * @param options - 客户端选项
 * @returns LLMClient 实例
 */
export function createLLMClient(options: LLMClientOptions): LLMClient {
  const {
    apiKey,
    baseURL = "https://api.openai.com/v1",
    model,
    timeout = DEFAULT_TIMEOUT,
    maxTokens,
    temperature = DEFAULT_TEMPERATURE,
  } = options;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("LLM client requires a non-empty apiKey");
  }

  async function chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "unknown");
        throw new Error(`LLM API error ${response.status}: ${bodyText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (data.error) {
        throw new Error(`LLM API error: ${data.error.message ?? "unknown"}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("LLM API returned empty content");
      }

      return content;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message))) {
        throw new Error(`LLM request timed out after ${timeout}ms`);
      }
      throw err;
    }
  }

  return { chat };
}
