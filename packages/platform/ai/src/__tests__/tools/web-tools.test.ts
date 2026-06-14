/**
 * Web 工具测试 — web_search / web_fetch
 * 正面 + 反面用例
 *
 * 注意：这些工具涉及网络请求，测试使用 mock fetch
 */
import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { createWebSearchTool } from "../../tools/web-search";
import { createWebFetchTool } from "../../tools/web-fetch";

// ─── web_search ───
describe("web_search tool", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 清除搜索引擎 API keys，只用 DuckDuckGo
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      const tool = createWebSearchTool();
      expect(tool.name).toBe("web_search");
      expect(tool.riskLevel).toBe("low");
    });

    test("参数定义", () => {
      const tool = createWebSearchTool();
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("query");
      expect(tool.parameters[0].required).toBe(true);
      expect(tool.parameters[1].name).toBe("count");
      expect(tool.parameters[1].required).toBe(false);
    });

    test("超时配置", () => {
      const tool = createWebSearchTool();
      expect(tool.timeout).toBe(30_000);
    });
  });

  describe("反面用例", () => {
    test("空查询返回错误", async () => {
      const tool = createWebSearchTool();
      const result = await tool.handler({ query: "" });
      expect(result).toEqual({ error: "搜索词不能为空" });
    });

    test("空白查询返回错误", async () => {
      const tool = createWebSearchTool();
      const result = await tool.handler({ query: "   " });
      expect(result).toEqual({ error: "搜索词不能为空" });
    });

    test("undefined 查询返回错误", async () => {
      const tool = createWebSearchTool();
      const result = await tool.handler({});
      expect(result).toEqual({ error: "搜索词不能为空" });
    });

    test("所有引擎失败时返回错误", async () => {
      // mock fetch 使 DuckDuckGo 也失败
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("network error");
      }) as any;
      try {
        const tool = createWebSearchTool();
        const result = await tool.handler({ query: "test query" });
        expect(result).toHaveProperty("error");
        expect((result as { error: string }).error).toContain("所有搜索引擎均失败");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("正面用例（mock fetch）", () => {
    test("DuckDuckGo 搜索成功", async () => {
      const mockHtml = `
        <html><body>
        <a class="result-link" href="https://example.com">Example Title</a>
        <td class="result-snippet">This is a snippet about the topic.</td>
        </body></html>
      `;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("duckduckgo.com")) {
          return new Response(mockHtml, { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }) as any;

      try {
        const tool = createWebSearchTool();
        const result = await tool.handler({ query: "test", count: 5 }) as Record<string, unknown>;
        expect(result).toHaveProperty("results");
        expect(result).toHaveProperty("engine");
        expect(Array.isArray(result.results)).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

// ─── web_fetch ───
describe("web_fetch tool", () => {
  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      const tool = createWebFetchTool();
      expect(tool.name).toBe("web_fetch");
      expect(tool.riskLevel).toBe("low");
    });

    test("参数定义", () => {
      const tool = createWebFetchTool();
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("url");
      expect(tool.parameters[0].required).toBe(true);
      expect(tool.parameters[1].name).toBe("max_chars");
      expect(tool.parameters[1].required).toBe(false);
    });
  });

  describe("反面用例", () => {
    test("空 URL 返回错误", async () => {
      const tool = createWebFetchTool();
      const result = await tool.handler({ url: "" });
      expect(result).toEqual({ error: "URL 必须以 http:// 或 https:// 开头" });
    });

    test("非 http/https URL 返回错误", async () => {
      const tool = createWebFetchTool();
      const result = await tool.handler({ url: "ftp://example.com" });
      expect(result).toEqual({ error: "URL 必须以 http:// 或 https:// 开头" });
    });

    test("无协议 URL 返回错误", async () => {
      const tool = createWebFetchTool();
      const result = await tool.handler({ url: "example.com" });
      expect(result).toEqual({ error: "URL 必须以 http:// 或 https:// 开头" });
    });

    test("undefined URL 返回错误", async () => {
      const tool = createWebFetchTool();
      const result = await tool.handler({});
      expect(result).toEqual({ error: "URL 必须以 http:// 或 https:// 开头" });
    });

    test("HTTP 错误返回错误信息", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response("not found", { status: 404 })) as any;
      try {
        const tool = createWebFetchTool();
        const result = await tool.handler({ url: "https://example.com" });
        expect(result).toHaveProperty("error");
        expect((result as { error: string }).error).toContain("抓取失败");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("网络超时返回错误", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("The operation was aborted");
      }) as any;
      try {
        const tool = createWebFetchTool();
        const result = await tool.handler({ url: "https://example.com" });
        expect(result).toHaveProperty("error");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("正面用例（mock fetch）", () => {
    test("成功抓取并返回内容", async () => {
      const mockContent = "Title: Test\nURL Source: https://example.com\n\n# Hello\n\nThis is content.";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response(mockContent, { status: 200 })) as any;

      try {
        const tool = createWebFetchTool();
        const result = await tool.handler({ url: "https://example.com" }) as Record<string, unknown>;
        expect(result).toHaveProperty("url", "https://example.com");
        expect(result).toHaveProperty("content");
        expect(result).toHaveProperty("raw_length");
        expect(result).toHaveProperty("trimmed_length");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("自定义 max_chars", async () => {
      const longContent = "Title: Test\n\n" + "word ".repeat(5000);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response(longContent, { status: 200 })) as any;

      try {
        const tool = createWebFetchTool();
        const result = await tool.handler({ url: "https://example.com", max_chars: 500 }) as Record<string, unknown>;
        // 内容应被截断，但截断逻辑按段落和行进行，允许一定余量
        expect((result.content as string).length).toBeLessThan(longContent.length);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("http:// URL 也有效", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response("content", { status: 200 })) as any;

      try {
        const tool = createWebFetchTool();
        const result = await tool.handler({ url: "http://example.com" }) as Record<string, unknown>;
        expect(result).toHaveProperty("url", "http://example.com");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
