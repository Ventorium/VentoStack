/**
 * 文件系统工具测试 — ls / cat / find / grep / head / tail
 * 正面 + 反面用例
 * 使用 mock KnowledgeBaseService
 */
import { describe, expect, test, mock } from "bun:test";
import { createFsLsTool } from "../../tools/fs-ls";
import { createFsCatTool } from "../../tools/fs-cat";
import { createFsFindTool } from "../../tools/fs-find";
import { createFsGrepTool } from "../../tools/fs-grep";
import { createFsHeadTool } from "../../tools/fs-head";
import { createFsTailTool } from "../../tools/fs-tail";
import type { KnowledgeBaseService, FileEntry, FileContent, SearchResult } from "../../knowledge-base/types";

const KB_ID = "kb-001";

function createMockKBService(overrides?: Partial<KnowledgeBaseService>): KnowledgeBaseService {
  return {
    ls: mock(async () => [
      { name: "docs", path: "docs", type: "directory" as const, size: 0, modifiedAt: new Date().toISOString() },
      { name: "readme.md", path: "readme.md", type: "file" as const, size: 100, modifiedAt: new Date().toISOString() },
    ]),
    cat: mock(async () => ({
      path: "readme.md",
      title: "README",
      content: "# Hello\n\nWorld",
      frontmatter: {},
      links: [],
    })),
    grep: mock(async () => [
      { path: "readme.md", title: "README", excerpt: "Hello World", lineNumber: 1, score: 0.9 },
    ]),
    find: mock(async () => [
      { name: "readme.md", path: "readme.md", type: "file" as const, size: 100, modifiedAt: new Date().toISOString() },
    ]),
    head: mock(async () => "# Hello\n\nWorld"),
    tail: mock(async () => "World"),
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

// ─── ls ───
describe("ls tool", () => {
  describe("正面用例", () => {
    test("列出根目录", async () => {
      const kb = createMockKBService();
      const tool = createFsLsTool(kb, KB_ID);
      const result = await tool.handler({});
      expect(Array.isArray(result)).toBe(true);
      expect((result as FileEntry[])).toHaveLength(2);
      expect((result as FileEntry[])[0].name).toBe("docs");
    });

    test("指定路径", async () => {
      const kb = createMockKBService();
      const tool = createFsLsTool(kb, KB_ID);
      await tool.handler({ path: "docs/api" });
      expect(kb.ls).toHaveBeenCalledWith(KB_ID, "docs/api", 2, "");
    });

    test("指定深度", async () => {
      const kb = createMockKBService();
      const tool = createFsLsTool(kb, KB_ID);
      await tool.handler({ depth: 5 });
      expect(kb.ls).toHaveBeenCalledWith(KB_ID, ".", 5, "");
    });

    test("默认深度为 2", async () => {
      const kb = createMockKBService();
      const tool = createFsLsTool(kb, KB_ID);
      await tool.handler({});
      expect(kb.ls).toHaveBeenCalledWith(KB_ID, ".", 2, "");
    });
  });

  describe("反面用例", () => {
    test("kbService.ls 抛错", async () => {
      const kb = createMockKBService({
        ls: mock(async () => { throw new Error("KB not found"); }),
      });
      const tool = createFsLsTool(kb, KB_ID);
      expect(tool.handler({})).rejects.toThrow("KB not found");
    });
  });

  describe("工具元数据", () => {
    test("名称", () => {
      const kb = createMockKBService();
      const tool = createFsLsTool(kb, KB_ID);
      expect(tool.name).toBe("ls");
    });
  });
});

// ─── cat ───
describe("cat tool", () => {
  describe("正面用例", () => {
    test("读取存在的文件", async () => {
      const kb = createMockKBService();
      const tool = createFsCatTool(kb, KB_ID);
      const result = await tool.handler({ path: "readme.md" });
      expect(result).toHaveProperty("path", "readme.md");
      expect(result).toHaveProperty("content", "# Hello\n\nWorld");
    });

    test("返回完整的 FileContent", async () => {
      const kb = createMockKBService();
      const tool = createFsCatTool(kb, KB_ID);
      const result = await tool.handler({ path: "readme.md" }) as FileContent;
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("frontmatter");
      expect(result).toHaveProperty("links");
    });
  });

  describe("反面用例", () => {
    test("文件不存在返回 error", async () => {
      const kb = createMockKBService({
        cat: mock(async () => null),
      });
      const tool = createFsCatTool(kb, KB_ID);
      const result = await tool.handler({ path: "nonexistent.md" });
      expect(result).toEqual({ error: "文件 nonexistent.md 不存在" });
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createFsCatTool(kb, KB_ID);
      expect(tool.name).toBe("cat");
      expect(tool.parameters).toHaveLength(1);
      expect(tool.parameters[0].name).toBe("path");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});

// ─── find ───
describe("find tool", () => {
  describe("正面用例", () => {
    test("按文件名查找", async () => {
      const kb = createMockKBService();
      const tool = createFsFindTool(kb, KB_ID);
      const result = await tool.handler({ name: "readme" });
      expect(Array.isArray(result)).toBe(true);
      expect(kb.find).toHaveBeenCalledWith(KB_ID, "readme", undefined, undefined, "");
    });

    test("按扩展名查找", async () => {
      const kb = createMockKBService();
      const tool = createFsFindTool(kb, KB_ID);
      await tool.handler({ ext: ".md" });
      expect(kb.find).toHaveBeenCalledWith(KB_ID, undefined, ".md", undefined, "");
    });

    test("限定目录查找", async () => {
      const kb = createMockKBService();
      const tool = createFsFindTool(kb, KB_ID);
      await tool.handler({ path: "docs" });
      expect(kb.find).toHaveBeenCalledWith(KB_ID, undefined, undefined, "docs", "");
    });

    test("组合参数", async () => {
      const kb = createMockKBService();
      const tool = createFsFindTool(kb, KB_ID);
      await tool.handler({ name: "api", ext: ".ts", path: "src" });
      expect(kb.find).toHaveBeenCalledWith(KB_ID, "api", ".ts", "src", "");
    });
  });

  describe("反面用例", () => {
    test("kbService.find 抛错", async () => {
      const kb = createMockKBService({
        find: mock(async () => { throw new Error("search failed"); }),
      });
      const tool = createFsFindTool(kb, KB_ID);
      expect(tool.handler({})).rejects.toThrow("search failed");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createFsFindTool(kb, KB_ID);
      expect(tool.name).toBe("find");
      expect(tool.parameters).toHaveLength(3);
    });
  });
});

// ─── grep ───
describe("grep tool", () => {
  describe("正面用例", () => {
    test("基本搜索", async () => {
      const kb = createMockKBService();
      const tool = createFsGrepTool(kb, KB_ID);
      const result = await tool.handler({ query: "hello" });
      expect(Array.isArray(result)).toBe(true);
      expect(kb.grep).toHaveBeenCalledWith(KB_ID, "hello", undefined, "", 10);
    });

    test("限定路径搜索", async () => {
      const kb = createMockKBService();
      const tool = createFsGrepTool(kb, KB_ID);
      await tool.handler({ query: "test", path: "docs" });
      expect(kb.grep).toHaveBeenCalledWith(KB_ID, "test", "docs", "", 10);
    });

    test("自定义 limit", async () => {
      const kb = createMockKBService();
      const tool = createFsGrepTool(kb, KB_ID);
      await tool.handler({ query: "test", limit: 5 });
      expect(kb.grep).toHaveBeenCalledWith(KB_ID, "test", undefined, "", 5);
    });

    test("默认 limit 为 10", async () => {
      const kb = createMockKBService();
      const tool = createFsGrepTool(kb, KB_ID);
      await tool.handler({ query: "test" });
      expect(kb.grep).toHaveBeenCalledWith(KB_ID, "test", undefined, "", 10);
    });
  });

  describe("反面用例", () => {
    test("kbService.grep 抛错", async () => {
      const kb = createMockKBService({
        grep: mock(async () => { throw new Error("grep failed"); }),
      });
      const tool = createFsGrepTool(kb, KB_ID);
      expect(tool.handler({ query: "test" })).rejects.toThrow("grep failed");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createFsGrepTool(kb, KB_ID);
      expect(tool.name).toBe("grep");
      expect(tool.parameters[0].name).toBe("query");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});

// ─── head ───
describe("head tool", () => {
  describe("正面用例", () => {
    test("读取文件开头", async () => {
      const kb = createMockKBService();
      const tool = createFsHeadTool(kb, KB_ID);
      const result = await tool.handler({ path: "readme.md" });
      expect(result).toBe("# Hello\n\nWorld");
      expect(kb.head).toHaveBeenCalledWith(KB_ID, "readme.md", 20, "");
    });

    test("自定义行数", async () => {
      const kb = createMockKBService();
      const tool = createFsHeadTool(kb, KB_ID);
      await tool.handler({ path: "readme.md", lines: 5 });
      expect(kb.head).toHaveBeenCalledWith(KB_ID, "readme.md", 5, "");
    });

    test("默认 20 行", async () => {
      const kb = createMockKBService();
      const tool = createFsHeadTool(kb, KB_ID);
      await tool.handler({ path: "readme.md" });
      expect(kb.head).toHaveBeenCalledWith(KB_ID, "readme.md", 20, "");
    });
  });

  describe("反面用例", () => {
    test("kbService.head 抛错", async () => {
      const kb = createMockKBService({
        head: mock(async () => { throw new Error("file not found"); }),
      });
      const tool = createFsHeadTool(kb, KB_ID);
      expect(tool.handler({ path: "missing.md" })).rejects.toThrow("file not found");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createFsHeadTool(kb, KB_ID);
      expect(tool.name).toBe("head");
      expect(tool.parameters[0].name).toBe("path");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});

// ─── tail ───
describe("tail tool", () => {
  describe("正面用例", () => {
    test("读取文件结尾", async () => {
      const kb = createMockKBService();
      const tool = createFsTailTool(kb, KB_ID);
      const result = await tool.handler({ path: "readme.md" });
      expect(result).toBe("World");
      expect(kb.tail).toHaveBeenCalledWith(KB_ID, "readme.md", 20, "");
    });

    test("自定义行数", async () => {
      const kb = createMockKBService();
      const tool = createFsTailTool(kb, KB_ID);
      await tool.handler({ path: "readme.md", lines: 3 });
      expect(kb.tail).toHaveBeenCalledWith(KB_ID, "readme.md", 3, "");
    });

    test("默认 20 行", async () => {
      const kb = createMockKBService();
      const tool = createFsTailTool(kb, KB_ID);
      await tool.handler({ path: "readme.md" });
      expect(kb.tail).toHaveBeenCalledWith(KB_ID, "readme.md", 20, "");
    });
  });

  describe("反面用例", () => {
    test("kbService.tail 抛错", async () => {
      const kb = createMockKBService({
        tail: mock(async () => { throw new Error("file not found"); }),
      });
      const tool = createFsTailTool(kb, KB_ID);
      expect(tool.handler({ path: "missing.md" })).rejects.toThrow("file not found");
    });
  });

  describe("工具元数据", () => {
    test("名称和参数", () => {
      const kb = createMockKBService();
      const tool = createFsTailTool(kb, KB_ID);
      expect(tool.name).toBe("tail");
      expect(tool.parameters[0].name).toBe("path");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});
