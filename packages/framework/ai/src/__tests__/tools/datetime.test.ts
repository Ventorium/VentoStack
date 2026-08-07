/**
 * datetime 工具测试 — 正面 + 反面用例
 */
import { describe, expect, test } from "bun:test";
import { createDatetimeTool } from "../../tools/datetime";

const tool = createDatetimeTool();

describe("datetime tool", () => {
  // ─── 正面用例 ───
  describe("正面用例", () => {
    test("默认返回 UTC 时间", async () => {
      const result = await tool.handler({});
      expect(result).toHaveProperty("timezone", "UTC");
      expect(result).toHaveProperty("datetime");
      expect(result).toHaveProperty("iso");
      expect(result).toHaveProperty("timestamp");
      expect(typeof (result as Record<string, string>).datetime).toBe("string");
      expect(typeof (result as Record<string, string>).iso).toBe("string");
    });

    test("指定时区 Asia/Shanghai", async () => {
      const result = await tool.handler({ timezone: "Asia/Shanghai" });
      expect(result).toHaveProperty("timezone", "Asia/Shanghai");
      expect(result).toHaveProperty("datetime");
    });

    test("指定时区 America/New_York", async () => {
      const result = await tool.handler({ timezone: "America/New_York" });
      expect(result).toHaveProperty("timezone", "America/New_York");
    });

    test("指定时区 Europe/London", async () => {
      const result = await tool.handler({ timezone: "Europe/London" });
      expect(result).toHaveProperty("timezone", "Europe/London");
    });

    test("ISO 格式有效", async () => {
      const result = await tool.handler({}) as Record<string, string>;
      const date = new Date(result.iso);
      expect(date.getTime()).not.toBeNaN();
    });

    test("timestamp 是有效的 unix 时间戳", async () => {
      const result = await tool.handler({}) as Record<string, string>;
      const ts = Number(result.timestamp);
      expect(ts).toBeGreaterThan(1_000_000_000); // 2001 年之后
      expect(ts).toBeLessThan(2_000_000_000); // 2033 年之前
    });

    test("不传 timezone 使用 UTC", async () => {
      const result = await tool.handler({ timezone: undefined });
      expect(result).toHaveProperty("timezone", "UTC");
    });

    test("空字符串 timezone 使用 UTC", async () => {
      const result = await tool.handler({ timezone: "" });
      expect(result).toHaveProperty("timezone", "UTC");
    });
  });

  // ─── 反面用例 ───
  describe("反面用例", () => {
    test("无效时区返回错误", async () => {
      const result = await tool.handler({ timezone: "Invalid/Timezone" });
      expect(result).toHaveProperty("error");
      expect((result as Record<string, string>).error).toContain("无效的时区");
    });

    test("随机字符串时区返回错误", async () => {
      const result = await tool.handler({ timezone: "not-a-timezone" });
      expect(result).toHaveProperty("error");
    });
  });

  // ─── 工具元数据 ───
  describe("工具元数据", () => {
    test("工具名称", () => {
      expect(tool.name).toBe("datetime");
    });

    test("风险等级", () => {
      expect(tool.riskLevel).toBe("low");
    });

    test("参数定义", () => {
      expect(tool.parameters).toHaveLength(1);
      expect(tool.parameters[0].name).toBe("timezone");
      expect(tool.parameters[0].required).toBe(false);
    });
  });
});
