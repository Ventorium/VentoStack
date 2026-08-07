/**
 * calculator 工具测试 — 正面 + 反面用例
 */
import { describe, expect, test } from "bun:test";
import { createCalculatorTool } from "../../tools/calculator";

const tool = createCalculatorTool();

describe("calculator tool", () => {
  // ─── 正面用例 ───
  describe("正面用例", () => {
    test("简单加法", async () => {
      const result = await tool.handler({ expression: "2 + 3" });
      expect(result).toEqual({ result: 5, expression: "2 + 3" });
    });

    test("简单减法", async () => {
      const result = await tool.handler({ expression: "10 - 4" });
      expect(result).toEqual({ result: 6, expression: "10 - 4" });
    });

    test("简单乘法", async () => {
      const result = await tool.handler({ expression: "6 * 7" });
      expect(result).toEqual({ result: 42, expression: "6 * 7" });
    });

    test("简单除法", async () => {
      const result = await tool.handler({ expression: "15 / 3" });
      expect(result).toEqual({ result: 5, expression: "15 / 3" });
    });

    test("幂运算", async () => {
      const result = await tool.handler({ expression: "2 ** 10" });
      expect(result).toEqual({ result: 1024, expression: "2 ** 10" });
    });

    test("取模运算", async () => {
      const result = await tool.handler({ expression: "10 % 3" });
      expect(result).toEqual({ result: 1, expression: "10 % 3" });
    });

    test("括号优先级", async () => {
      const result = await tool.handler({ expression: "2 * (3 + 4)" });
      expect(result).toEqual({ result: 14, expression: "2 * (3 + 4)" });
    });

    test("嵌套括号", async () => {
      const result = await tool.handler({ expression: "((2 + 3) * (4 - 1))" });
      expect(result).toEqual({ result: 15, expression: "((2 + 3) * (4 - 1))" });
    });

    test("小数运算", async () => {
      const result = await tool.handler({ expression: "1.5 + 2.3" });
      expect(result).toEqual({ result: 3.8, expression: "1.5 + 2.3" });
    });

    test("负数", async () => {
      const result = await tool.handler({ expression: "-5 + 3" });
      expect(result).toEqual({ result: -2, expression: "-5 + 3" });
    });

    test("正号", async () => {
      const result = await tool.handler({ expression: "+5" });
      expect(result).toEqual({ result: 5, expression: "+5" });
    });

    test("复杂表达式", async () => {
      const result = await tool.handler({ expression: "2 + 3 * 4 ** 2 - 1" });
      // 4**2=16, 3*16=48, 2+48=50, 50-1=49
      expect(result).toEqual({ result: 49, expression: "2 + 3 * 4 ** 2 - 1" });
    });

    test("右结合幂运算", async () => {
      const result = await tool.handler({ expression: "2 ** 3 ** 2" });
      // 3**2=9, 2**9=512
      expect(result).toEqual({ result: 512, expression: "2 ** 3 ** 2" });
    });

    test("带空格的表达式", async () => {
      const result = await tool.handler({ expression: "  1 + 2  " });
      expect(result).toEqual({ result: 3, expression: "1 + 2" }); // handler 会 trim
    });

    test("除法产生小数", async () => {
      const result = await tool.handler({ expression: "10 / 4" });
      expect(result).toEqual({ result: 2.5, expression: "10 / 4" });
    });
  });

  // ─── 反面用例 ───
  describe("反面用例", () => {
    test("空表达式", async () => {
      const result = await tool.handler({ expression: "" });
      expect(result).toEqual({ error: "表达式不能为空" });
    });

    test("空白表达式", async () => {
      const result = await tool.handler({ expression: "   " });
      expect(result).toEqual({ error: "表达式不能为空" });
    });

    test("undefined 表达式", async () => {
      const result = await tool.handler({});
      expect(result).toEqual({ error: "表达式不能为空" });
    });

    test("除以零", async () => {
      const result = await tool.handler({ expression: "1 / 0" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("除以零");
    });

    test("取模除以零", async () => {
      const result = await tool.handler({ expression: "10 % 0" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("除以零");
    });

    test("非法字符", async () => {
      const result = await tool.handler({ expression: "2 + @3" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("非法字符");
    });

    test("缺少右括号", async () => {
      const result = await tool.handler({ expression: "(2 + 3" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("缺少右括号");
    });

    test("多余的 token", async () => {
      const result = await tool.handler({ expression: "2 + 3 4" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("多余的 token");
    });

    test("连续运算符", async () => {
      const result = await tool.handler({ expression: "2 + + 3" });
      // 这实际上解析为 2 + (+3) = 5，这是合法的
      expect(result).toEqual({ result: 5, expression: "2 + + 3" });
    });

    test("空括号", async () => {
      const result = await tool.handler({ expression: "()" });
      expect(result).toHaveProperty("error");
    });

    test("字母字符", async () => {
      const result = await tool.handler({ expression: "abc" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("非法字符");
    });
  });

  // ─── 工具元数据 ───
  describe("工具元数据", () => {
    test("工具名称", () => {
      expect(tool.name).toBe("calculator");
    });

    test("参数定义", () => {
      expect(tool.parameters).toHaveLength(1);
      expect(tool.parameters[0].name).toBe("expression");
      expect(tool.parameters[0].required).toBe(true);
    });
  });
});
