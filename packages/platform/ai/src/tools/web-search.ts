/**
 * Web Search 工具 — 多源聚合搜索
 *
 * 优先级链：DuckDuckGo (免费兜底) → 环境变量配置的引擎
 * 参考 /code/aggregated-search 的 DuckDuckGo Lite 实现
 */

const DEFAULT_TIMEOUT = 15_000;

interface SearchResult {
  title: string;
  url: string;
  source: string;
  body: string;
}

/** DuckDuckGo Lite HTML 解析（无需 API Key） */
function parseDDGHtml(html: string): SearchResult[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const results: SearchResult[] = [];
  const re = /<a\b([^>]*\bclass=['"]result-link['"][^>]*)>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*\bclass=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

  for (const m of clean.matchAll(re)) {
    const attrs = m[1];
    const rawTitle = m[2].replace(/<[^>]+>/g, "").trim();
    const title = rawTitle.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    const body = m[3].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

    let href = "";
    const hm = /\bhref="([^"]*)"|href='([^']*)'/i.exec(attrs);
    if (hm) href = hm[1] ?? hm[2] ?? "";

    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch {} }

    if (!href || !href.startsWith("http") || href.includes("duckduckgo.com")) continue;
    if (!title || title === "more info") continue;
    results.push({ title, url: href, source: "duckduckgo", body });
  }
  return results;
}

/** DuckDuckGo Lite 搜索 */
async function searchDDG(query: string, count: number, timeout: number): Promise<SearchResult[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: new URLSearchParams({ q: query, kl: "cn-zh" }).toString(),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!resp.ok) throw new Error(`DDG HTTP ${resp.status}`);
    const html = await resp.text();
    return parseDDGHtml(html).slice(0, count);
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

/** Serper (Google) 搜索 — 需要 SERPER_API_KEY */
async function searchSerper(query: string, count: number, timeout: number): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY not set");

  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: count }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) throw new Error(`Serper HTTP ${resp.status}`);
  const data = await resp.json() as { organic?: Array<{ title: string; link: string; snippet: string }> };
  return (data.organic ?? []).map(r => ({ title: r.title, url: r.link, source: "serper", body: r.snippet }));
}

/** Tavily 搜索 — 需要 TAVILY_API_KEY */
async function searchTavily(query: string, count: number, timeout: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = await resp.json() as { results?: Array<{ title: string; url: string; content: string }> };
  return (data.results ?? []).map(r => ({ title: r.title, url: r.url, source: "tavily", body: r.content }));
}

export function createWebSearchTool() {
  return {
    name: "web_search",
    description: "搜索互联网获取最新信息。返回搜索结果列表，每项包含标题、URL 和摘要。支持多个搜索引擎自动降级。",
    parameters: [
      { name: "query", type: "string" as const, description: "搜索关键词", required: true },
      { name: "count", type: "number" as const, description: "返回结果数量，默认 5，最多 10", required: false },
    ],
    riskLevel: "low" as const,
    timeout: 30_000,
    async handler(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const query = (params.query as string)?.trim();
      if (!query) return { error: "搜索词不能为空" };

      const count = Math.min(10, Math.max(1, Number(params.count) || 5));

      // 搜索引擎降级链：Tavily → Serper → DuckDuckGo
      const engines: Array<{ name: string; fn: () => Promise<SearchResult[]> }> = [];

      if (process.env.TAVILY_API_KEY) {
        engines.push({ name: "tavily", fn: () => searchTavily(query, count, DEFAULT_TIMEOUT) });
      }
      if (process.env.SERPER_API_KEY) {
        engines.push({ name: "serper", fn: () => searchSerper(query, count, DEFAULT_TIMEOUT) });
      }
      // DuckDuckGo 兜底（无需 key）
      engines.push({ name: "duckduckgo", fn: () => searchDDG(query, count, DEFAULT_TIMEOUT) });

      let lastError: Error | null = null;
      for (const engine of engines) {
        try {
          const results = await engine.fn();
          if (results.length > 0) {
            return { query, engine: engine.name, results, count: results.length };
          }
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
        }
      }

      return { error: `所有搜索引擎均失败: ${lastError?.message ?? "未知错误"}`, query };
    },
  };
}
