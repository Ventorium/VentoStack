/**
 * file-ops 工具测试 — file-read + file-write
 * 正面 + 反面用例
 */
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createFileReadTool, createFileWriteTool } from "../../tools/file-ops";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "file-ops-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ─── file-read ───
describe("file-read tool", () => {
  describe("正面用例", () => {
    test("读取存在的文件", async () => {
      const filePath = join(tempDir, "test.txt");
      await writeFile(filePath, "hello world");
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath });
      expect(result).toEqual({ content: "hello world", path: filePath });
    });

    test("读取空文件", async () => {
      const filePath = join(tempDir, "empty.txt");
      await writeFile(filePath, "");
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath });
      expect(result).toEqual({ content: "", path: filePath });
    });

    test("读取含中文的文件", async () => {
      const filePath = join(tempDir, "cn.txt");
      await writeFile(filePath, "你好世界");
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath });
      expect(result).toEqual({ content: "你好世界", path: filePath });
    });

    test("读取含换行的文件", async () => {
      const filePath = join(tempDir, "multi.txt");
      await writeFile(filePath, "line1\nline2\nline3");
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath }) as { content: string };
      expect(result.content).toBe("line1\nline2\nline3");
    });

    test("多个 allowedPaths 都可访问", async () => {
      const dir2 = await mkdtemp(join(tmpdir(), "file-ops-test2-"));
      try {
        const filePath = join(dir2, "other.txt");
        await writeFile(filePath, "other dir");
        const tool = createFileReadTool({ allowedPaths: [tempDir, dir2] });
        const result = await tool.handler({ path: filePath }) as { content: string };
        expect(result.content).toBe("other dir");
      } finally {
        await rm(dir2, { recursive: true, force: true });
      }
    });
  });

  describe("反面用例", () => {
    test("路径为空", async () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: "" });
      expect(result).toEqual({ error: "路径不能为空" });
    });

    test("路径为 undefined", async () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({});
      expect(result).toEqual({ error: "路径不能为空" });
    });

    test("不允许的路径", async () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: "/etc/passwd" });
      expect(result).toEqual({ error: "不允许访问该路径" });
    });

    test("路径遍历被拦截", async () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: join(tempDir, "../../../etc/passwd") });
      expect(result).toEqual({ error: "不允许访问该路径" });
    });

    test("文件不存在", async () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: join(tempDir, "nonexistent.txt") });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("文件不存在");
    });

    test("文件过大被拒绝", async () => {
      const filePath = join(tempDir, "big.txt");
      await writeFile(filePath, "x".repeat(200));
      const tool = createFileReadTool({ allowedPaths: [tempDir], maxReadSize: 100 });
      const result = await tool.handler({ path: filePath });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("文件过大");
    });
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      const tool = createFileReadTool({ allowedPaths: [tempDir] });
      expect(tool.name).toBe("file-read");
      expect(tool.riskLevel).toBe("medium");
    });
  });
});

// ─── file-write ───
describe("file-write tool", () => {
  describe("正面用例", () => {
    test("写入新文件", async () => {
      const filePath = join(tempDir, "new.txt");
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath, content: "hello" });
      expect(result).toEqual({ success: true, path: filePath });
      // 验证文件确实被写入
      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("hello");
    });

    test("覆盖已有文件", async () => {
      const filePath = join(tempDir, "existing.txt");
      await writeFile(filePath, "old content");
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      await tool.handler({ path: filePath, content: "new content" });
      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("new content");
    });

    test("写入空内容", async () => {
      const filePath = join(tempDir, "empty.txt");
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: filePath, content: "" });
      expect(result).toEqual({ error: "内容不能为空" });
    });

    test("写入中文内容", async () => {
      const filePath = join(tempDir, "cn.txt");
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      await tool.handler({ path: filePath, content: "你好世界" });
      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("你好世界");
    });

    test("写入 JSON 内容", async () => {
      const filePath = join(tempDir, "data.json");
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const json = JSON.stringify({ a: 1, b: [2, 3] });
      await tool.handler({ path: filePath, content: json });
      const content = await readFile(filePath, "utf-8");
      expect(JSON.parse(content)).toEqual({ a: 1, b: [2, 3] });
    });
  });

  describe("反面用例", () => {
    test("路径为空", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: "", content: "data" });
      expect(result).toEqual({ error: "路径不能为空" });
    });

    test("路径为 undefined", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ content: "data" });
      expect(result).toEqual({ error: "路径不能为空" });
    });

    test("内容为空", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: join(tempDir, "f.txt"), content: "" });
      expect(result).toEqual({ error: "内容不能为空" });
    });

    test("内容为 undefined", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: join(tempDir, "f.txt") });
      expect(result).toEqual({ error: "内容不能为空" });
    });

    test("不允许的路径", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({ path: "/tmp/hack.txt", content: "hack" });
      expect(result).toEqual({ error: "不允许写入该路径" });
    });

    test("路径遍历被拦截", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      const result = await tool.handler({
        path: join(tempDir, "../../../tmp/hack.txt"),
        content: "hack",
      });
      expect(result).toEqual({ error: "不允许写入该路径" });
    });

    test("内容过大被拒绝", async () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir], maxWriteSize: 50 });
      const result = await tool.handler({
        path: join(tempDir, "big.txt"),
        content: "x".repeat(100),
      });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("内容过大");
    });
  });

  describe("工具元数据", () => {
    test("名称、风险等级、需要审批", () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      expect(tool.name).toBe("file-write");
      expect(tool.riskLevel).toBe("high");
      expect(tool.requiresApproval).toBe(true);
    });

    test("参数定义", () => {
      const tool = createFileWriteTool({ allowedPaths: [tempDir] });
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("path");
      expect(tool.parameters[0].required).toBe(true);
      expect(tool.parameters[1].name).toBe("content");
      expect(tool.parameters[1].required).toBe(true);
    });
  });
});
