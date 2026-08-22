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

/** 内网/私有主机名模式（单标签主机名、.local/.internal 伪域） */
const PRIVATE_HOSTNAME_PATTERNS = [/^localhost$/i, /\.local$/i, /\.internal$/i];

/** 判断 IPv4 地址是否属于私网/保留段（10/8、127/8、0/8、172.16/12、192.168/16、169.254/16、100.64/10） */
function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((n) => n > 255)) return true; // 非法地址一并拒绝
  const [a, b] = [octets[0]!, octets[1]!];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** 判断主机名是否为内网/私有地址（防 SSRF 与内网拓扑外发给第三方 Reader） */
function isPrivateHost(hostname: string): boolean {
  // 剥离 IPv6 方括号与根标签尾点（`127.0.0.1.`、`localhost.` 是同一主机的 FQDN 写法）
  const bare = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(bare))) return true;
  // IPv6 本地/ULA/链路本地/保留段（::1、::、fc00::/7、fe00::/10 全部非全局单播）
  if (bare === "::1" || bare === "::" || /^(fc|fd|fe)/i.test(bare)) return true;
  // IPv4 映射的 IPv6（::ffff:10.0.0.1）
  const v4mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]!);
  if (bare.includes(".")) return isPrivateIPv4(bare);
  // 无点单标签主机名（如 k8s service 名）按内网处理
  return true;
}

export interface WebFetchToolOptions {
  /** Reader 服务基址（默认 r.jina.ai）；可指向自建实例，避免目标 URL 外发给第三方 */
  readerBaseUrl?: string;
  /** 是否允许抓取内网/私有地址（默认 false；仅自建 Reader 且明确需要时开启） */
  allowPrivateHosts?: boolean;
}

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

export function createWebFetchTool(options: WebFetchToolOptions = {}) {
  const readerBase = (options.readerBaseUrl ?? JINA_READER).replace(/\/+$/, "");
  const allowPrivateHosts = options.allowPrivateHosts === true;

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

      // 内网地址防护：目标 URL 会转发给外部 Reader 服务，
      // 默认拒绝私有/链路本地主机，防止 SSRF 与内网拓扑外泄
      if (!allowPrivateHosts) {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return { error: "URL 格式不合法" };
        }
        if (isPrivateHost(parsed.hostname)) {
          return { error: "不允许抓取内网或私有地址" };
        }
      }

      const maxChars = Math.min(50_000, Math.max(1000, Number(params.max_chars) || DEFAULT_MAX_CHARS));

      try {
        const resp = await fetch(`${readerBase}/${encodeURIComponent(url)}`, {
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
