/**
 * Web Fetch 工具 — 抓取网页内容并做语义化精简
 *
 * 使用 Jina Reader (r.jina.ai) 将网页转为 Markdown，
 * 然后做智能截断：跳过元数据头，保留核心内容，限制 token 量。
 *
 * 最佳实践参考：
 * - Jina Reader API: 免费无需 key，自动去广告/导航/脚本
 * - 精简策略：跳过前 N 行元数据 → 按段落保留 → 字符上限截断
 * - 保留标题层级结构，便于 LLM 理解文档骨架
 */

const JINA_READER = "https://r.jina.ai";
const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_MAX_CHARS = 8000;

/** 语义化精简 Markdown 内容 */
function trimMarkdownContent(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
  if (!text) return "";

  const lines = text.split("\n");

  // 1. 跳过 Jina 元数据头（前几行通常是 Title / URL Source / Published Time 等）
  let startIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    if (
      line.startsWith("Title:") ||
      line.startsWith("URL Source:") ||
      line.startsWith("Published Time:") ||
      line.startsWith("Markdown Content:") ||
      line.startsWith("![") ||
      line === ""
    ) {
      startIdx = i + 1;
      continue;
    }
    break;
  }

  // 2. 收集有语义价值的行
  const kept: string[] = [];
  let chars = 0;
  let inCodeBlock = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];

    // 跟踪代码块状态
    if (line.trim().startsWith("```")) inCodeBlock = !inCodeBlock;

    // 跳过纯空行（连续空行只保留一个）
    if (!line.trim()) {
      if (kept.length > 0 && kept[kept.length - 1].trim()) {
        kept.push("");
      }
      continue;
    }

    // 跳过导航/页脚类内容
    const lower = line.toLowerCase().trim();
    if (
      lower.startsWith("cookie") ||
      lower.startsWith("privacy policy") ||
      lower.startsWith("terms of") ||
      lower.includes("subscribe to") ||
      lower.includes("sign up for") ||
      lower.includes("advertisement")
    ) {
      continue;
    }

    // 保留标题行（帮助 LLM 理解结构）
    if (line.startsWith("#")) {
      kept.push(line);
      chars += line.length + 1;
      continue;
    }

    // 普通内容行
    if (chars + line.length > maxChars) {
      // 如果还没收集到足够内容，截断最后一行
      const remaining = maxChars - chars;
      if (remaining > 100) {
        kept.push(line.slice(0, remaining) + "...");
      }
      kept.push("\\n[内容已截断，共 " + lines.length + " 行]");
      break;
    }

    kept.push(line);
    chars += line.length + 1;
  }

  return kept.join("\\n").trim();
}

export function createWebFetchTool() {
  return {
    name: "web_fetch",
    description: "抓取指定 URL 的网页内容，返回精简后的 Markdown。适合阅读文章、文档、博客等页面。内容会自动去除导航、广告等无关信息。",
    parameters: [
      { name: "url", type: "string" as const, description: "要抓取的网页 URL", required: true },
      { name: "max_chars", type: "number" as const, description: "返回内容的最大字符数，默认 8000", required: false },
    ],
    riskLevel: "low" as const,
    timeout: DEFAULT_TIMEOUT + 5_000,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const url = params.url as string;
      if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        return { error: "URL 必须以 http:// 或 https:// 开头" };
      }

      const maxChars = Math.min(50_000, Math.max(1000, Number(params.max_chars) || DEFAULT_MAX_CHARS));

      try {
        const resp = await fetch(`${JINA_READER}/${encodeURIComponent(url)}`, {
          headers: {
            "X-Retain-Images": "none",
            "User-Agent": "VentoStack-AI/1.0",
          },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        });

        if (!resp.ok) {
          return { error: `抓取失败: HTTP ${resp.status}`, url };
        }

        const raw = await resp.text();
        const content = trimMarkdownContent(raw, maxChars);

        return {
          url,
          content,
          raw_length: raw.length,
          trimmed_length: content.length,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : "抓取失败", url };
      }
    },
  };
}
