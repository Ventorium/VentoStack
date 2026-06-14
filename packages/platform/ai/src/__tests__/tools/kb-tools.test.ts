/**
 * 知识库工具测试 — kb-browse / kb-read / kb-search / kb-follow-link
 * 正面 + 反面用例
 * 使用 mock KnowledgeBaseService
 */
import { describe, expect, test, mock } from "bun:test";
import { createKBBrowseTool } from "../../tools/kb-browse";
import { createKBReadTool } from "../../tools/kb-read";
import { createKBSearchTool } from "../../tools/kb-search";
import { createKBFollowLinkTool } from "../../tools/kb-follow-link";
import type { KnowledgeBaseService, FileEntry, FileContent, SearchResult } from "../../knowledge-base/types";

const TENANT_ID = "tenant-001";

function createMockKBService(overrides?: Partial<KnowledgeBaseService>): KnowledgeBaseService {
  return {
    ls: mock(async () => [
      { name: "guide.md", path: "guide.md", type: "file" as const, size: 200, modifiedAt: new Date().toISOString() },
      { name: "api", path: "api", type: "directory" as const, size: 0, modifiedAt: new Date().toISOString() },
    ]),
    cat: mock(async (kbId: string, path: string) => {
      if (path === "guide.md" || path === "Guide.md" || path === "guide") {
        return {
          path: "guide.md",
          title: "Guide",
          content: "# Guide\n\nWelcome to the guide.",
          frontmatter: { author: "test" },
          links: ["api-reference"],
        };
      }
      return null;
    }),
    grep: mock(async () => [
      { path: "guide.md", title: "Guide", excerpt: "Welcome", lineNumber: 3, score: 0.8 },
    ]),
    find: mock(async () => []),
    head: mock(async () => ""),
    tail: mock(async () => ""),
    create: mock(async () => ({} as any)),
    getById: mock(async () => null),
    list: mock(async () => []),
    delete: mock(async () => {}),
    writeFile: mock(async () => {}),
    renameFile: mock(async () => {}),
    mkdir: mock(async () => {}),
    deleteFile: mock(async () => {}),
    uploadFile: mock(async () => ({} as any)),
    getSourceFile: mock(async () => ({ buffer: Buffer.from(""), mimeType: "text/plain", fileName: "" })),
    generateReadme: mock(async () => ""),
    getSourcePath: mock(async () => ""),
    ...overrides,
  };
}

// ─── kb-browse ───
describe("kb-browse tool", () => {
  describe("正面用例", () => {
    test("浏览根目录", async () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1" });
      expect(Array.isArray(result)).toBe(true);
      expect((result as FileEntry[])).toHaveLength(2);
    });

    test("指定路径", async () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", path: "api" });
      expect(kb.ls).toHaveBeenCalledWith("kb-1", "api", 1, TENANT_ID);
    });

    test("指定深度", async () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", depth: 3 });
      expect(kb.ls).toHaveBeenCalledWith("kb-1", ".", 3, TENANT_ID);
    });

    test("深度被限制在 5", async () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", depth: 100 });
      expect(kb.ls).toHaveBeenCalledWith("kb-1", ".", 5, TENANT_ID);
    });

    test("默认深度为 1", async () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1" });
      expect(kb.ls).toHaveBeenCalledWith("kb-1", ".", 1, TENANT_ID);
    });
  });

  describe("反面用例", () => {
    test("kbService.ls 抛错", async () => {
      const kb = createMockKBService({
        ls: mock(async () => { throw new Error("KB not found"); }),
      });
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.handler({ kbId: "invalid" })).rejects.toThrow("KB not found");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createKBBrowseTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.name).toBe("kb-browse");
      expect(tool.parameters[0].name).toBe("kbId");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});

// ─── kb-read ───
describe("kb-read tool", () => {
  describe("正面用例", () => {
    test("读取存在的文件", async () => {
      const kb = createMockKBService();
      const tool = createKBReadTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", path: "guide.md" }) as FileContent;
      expect(result).toHaveProperty("path", "guide.md");
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("frontmatter");
    });

    test("传递 tenantId 到 cat", async () => {
      const kb = createMockKBService();
      const tool = createKBReadTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", path: "guide.md" });
      expect(kb.cat).toHaveBeenCalledWith("kb-1", "guide.md", TENANT_ID);
    });
  });

  describe("反面用例", () => {
    test("文件不存在返回 error", async () => {
      const kb = createMockKBService();
      const tool = createKBReadTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", path: "nonexistent.md" });
      expect(result).toEqual({ error: "文件不存在: nonexistent.md" });
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createKBReadTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.name).toBe("kb-read");
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("kbId");
      expect(tool.parameters[1].name).toBe("path");
    });
  });
});

// ─── kb-search ───
describe("kb-search tool", () => {
  describe("正面用例", () => {
    test("基本搜索", async () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", query: "welcome" });
      expect(Array.isArray(result)).toBe(true);
      expect(kb.grep).toHaveBeenCalledWith("kb-1", "welcome", undefined, TENANT_ID, 10);
    });

    test("自定义 limit", async () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", query: "test", limit: 5 });
      expect(kb.grep).toHaveBeenCalledWith("kb-1", "test", undefined, TENANT_ID, 5);
    });

    test("limit 被限制在 50", async () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", query: "test", limit: 100 });
      expect(kb.grep).toHaveBeenCalledWith("kb-1", "test", undefined, TENANT_ID, 50);
    });
  });

  describe("反面用例", () => {
    test("空查询返回空数组", async () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", query: "" });
      expect(result).toEqual([]);
    });

    test("空白查询返回空数组", async () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", query: "   " });
      expect(result).toEqual([]);
    });

    test("kbService.grep 抛错", async () => {
      const kb = createMockKBService({
        grep: mock(async () => { throw new Error("search error"); }),
      });
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.handler({ kbId: "kb-1", query: "test" })).rejects.toThrow("search error");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createKBSearchTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.name).toBe("kb-search");
      expect(tool.parameters[0].name).toBe("kbId");
      expect(tool.parameters[1].name).toBe("query");
    });
  });
});

// ─── kb-follow-link ───
describe("kb-follow-link tool", () => {
  describe("正面用例", () => {
    test("追踪存在的链接", async () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "guide" }) as FileContent;
      expect(result).toHaveProperty("path", "guide.md");
    });

    test("去除双方括号", async () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      await tool.handler({ kbId: "kb-1", link: "[[Guide]]" });
      // 应该尝试 Guide.md 或 guide.md
      expect(kb.cat).toHaveBeenCalled();
    });

    test("尝试多种路径变体", async () => {
      const catMock = mock(async (kbId: string, path: string) => {
        if (path === "some-page.md") {
          return { path: "some-page.md", title: "Some Page", content: "content" };
        }
        return null;
      });
      const kb = createMockKBService({ cat: catMock });
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "Some Page" });
      // 应该尝试 "Some Page.md", "some-page.md", "Some Page"
      expect(catMock).toHaveBeenCalled();
    });

    test("grep 作为后备搜索", async () => {
      const catMock = mock(async () => null);
      const grepMock = mock(async () => [
        { path: "found.md", title: "Found", excerpt: "match", lineNumber: 1, score: 0.5 },
      ]);
      const kb = createMockKBService({ cat: catMock, grep: grepMock });
      // 当 cat 对 grep 返回的路径有效时
      const catMock2 = mock(async (kbId: string, path: string) => {
        if (path === "found.md") {
          return { path: "found.md", title: "Found", content: "content" };
        }
        return null;
      });
      const kb2 = createMockKBService({ cat: catMock2, grep: grepMock });
      const tool = createKBFollowLinkTool({ kbService: kb2, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "SomeUnknownPage" }) as FileContent;
      expect(result).toHaveProperty("path", "found.md");
    });
  });

  describe("反面用例", () => {
    test("空链接返回 error", async () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "" });
      expect(result).toEqual({ error: "链接为空" });
    });

    test("纯空格链接返回 error", async () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "  " });
      expect(result).toEqual({ error: "链接为空" });
    });

    test("双方括号内为空返回 error", async () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "[[]]" });
      expect(result).toEqual({ error: "链接为空" });
    });

    test("所有路径都找不到返回 error", async () => {
      const kb = createMockKBService({
        cat: mock(async () => null),
        grep: mock(async () => []),
      });
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      const result = await tool.handler({ kbId: "kb-1", link: "nonexistent" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("未找到链接目标");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createKBFollowLinkTool({ kbService: kb, tenantId: TENANT_ID });
      expect(tool.name).toBe("kb-follow-link");
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("kbId");
      expect(tool.parameters[1].name).toBe("link");
    });
  });
});
