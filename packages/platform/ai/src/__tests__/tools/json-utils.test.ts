/**
 * JSON 工具测试 — json_format / uuid / base64 / hash
 * 正面 + 反面用例
 */
import { describe, expect, test } from "bun:test";
import { createJsonFormatTool, createUuidTool, createBase64Tool, createHashTool } from "../../tools/json-utils";

// ─── json_format ───
describe("json_format tool", () => {
  const tool = createJsonFormatTool();

  describe("正面用例", () => {
    test("格式化 JSON（默认 action=format）", async () => {
      const result = await tool.handler({ input: '{"a":1,"b":[2,3]}' });
      expect(result).toEqual({ result: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}' });
    });

    test("minify 压缩 JSON", async () => {
      const result = await tool.handler({ input: '{\n  "a": 1,\n  "b": 2\n}', action: "minify" });
      expect(result).toEqual({ result: '{"a":1,"b":2}' });
    });

    test("validate 校验合法 JSON", async () => {
      const result = await tool.handler({ input: '{"a":1}', action: "validate" });
      expect(result).toEqual({ valid: true });
    });

    test("格式化数组", async () => {
      const result = await tool.handler({ input: "[1,2,3]" });
      expect(result).toEqual({ result: "[\n  1,\n  2,\n  3\n]" });
    });

    test("格式化嵌套对象", async () => {
      const result = await tool.handler({ input: '{"a":{"b":{"c":1}}}' });
      expect(result).toHaveProperty("result");
      expect((result as Record<string, string>).result).toContain('"c": 1');
    });

    test("格式化含特殊字符的字符串", async () => {
      const result = await tool.handler({ input: '{"msg":"hello \\"world\\""}' });
      expect(result).toHaveProperty("result");
    });
  });

  describe("反面用例", () => {
    test("非法 JSON（validate 返回 valid:false）", async () => {
      const result = await tool.handler({ input: "{invalid}", action: "validate" });
      expect(result).toEqual({ valid: false, error: expect.any(String) });
    });

    test("非法 JSON（format 返回 error）", async () => {
      const result = await tool.handler({ input: "{invalid}" });
      expect(result).toHaveProperty("error");
      expect((result as Record<string, string>).error).toContain("JSON 解析失败");
    });

    test("空字符串", async () => {
      const result = await tool.handler({ input: "" });
      expect(result).toHaveProperty("error");
    });

    test("非法 JSON（minify 返回 error）", async () => {
      const result = await tool.handler({ input: "not json", action: "minify" });
      expect(result).toHaveProperty("error");
    });
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      expect(tool.name).toBe("json_format");
      expect(tool.riskLevel).toBe("low");
    });
  });
});

// ─── uuid ───
describe("uuid tool", () => {
  const tool = createUuidTool();

  describe("正面用例", () => {
    test("默认生成 1 个 UUID", async () => {
      const result = await tool.handler({}) as Record<string, unknown>;
      expect(result).toHaveProperty("uuid");
      expect(typeof result.uuid).toBe("string");
      // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(result.uuid as string).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    test("生成多个 UUID", async () => {
      const result = await tool.handler({ count: 5 }) as Record<string, unknown>;
      expect(result).toHaveProperty("uuids");
      expect(Array.isArray(result.uuids)).toBe(true);
      expect((result.uuids as string[])).toHaveLength(5);
      // 每个 UUID 唯一
      const uniqueSet = new Set(result.uuids as string[]);
      expect(uniqueSet.size).toBe(5);
    });

    test("count=1 返回单个 uuid 字段", async () => {
      const result = await tool.handler({ count: 1 }) as Record<string, unknown>;
      expect(result).toHaveProperty("uuid");
      expect(result).not.toHaveProperty("uuids");
    });

    test("count 被限制在 1-20 范围", async () => {
      const result1 = await tool.handler({ count: 0 }) as Record<string, unknown>;
      expect(result1).toHaveProperty("uuid"); // 最小为 1

      const result2 = await tool.handler({ count: 100 }) as Record<string, unknown>;
      expect((result2.uuids as string[])).toHaveLength(20); // 最大为 20
    });
  });

  describe("反面用例", () => {
    test("负数 count 被修正为 1", async () => {
      const result = await tool.handler({ count: -5 }) as Record<string, unknown>;
      expect(result).toHaveProperty("uuid"); // count=1 → 单个 uuid
    });

    test("非数字 count 使用默认值 1", async () => {
      const result = await tool.handler({ count: "abc" }) as Record<string, unknown>;
      expect(result).toHaveProperty("uuid");
    });
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      expect(tool.name).toBe("uuid");
      expect(tool.riskLevel).toBe("low");
    });
  });
});

// ─── base64 ───
describe("base64 tool", () => {
  const tool = createBase64Tool();

  describe("正面用例", () => {
    test("编码（默认 action=encode）", async () => {
      const result = await tool.handler({ input: "hello" });
      expect(result).toEqual({ result: Buffer.from("hello").toString("base64") });
    });

    test("解码", async () => {
      const encoded = Buffer.from("hello world").toString("base64");
      const result = await tool.handler({ input: encoded, action: "decode" });
      expect(result).toEqual({ result: "hello world" });
    });

    test("编码中文", async () => {
      const result = await tool.handler({ input: "你好" });
      expect(result).toEqual({ result: Buffer.from("你好").toString("base64") });
    });

    test("解码中文", async () => {
      const encoded = Buffer.from("你好世界").toString("base64");
      const result = await tool.handler({ input: encoded, action: "decode" });
      expect(result).toEqual({ result: "你好世界" });
    });

    test("编码空字符串", async () => {
      const result = await tool.handler({ input: "" });
      expect(result).toEqual({ result: "" });
    });

    test("编码→解码 roundtrip", async () => {
      const original = "test string 123!@#";
      const encoded = await tool.handler({ input: original }) as Record<string, string>;
      const decoded = await tool.handler({ input: encoded.result, action: "decode" }) as Record<string, string>;
      expect(decoded.result).toBe(original);
    });
  });

  describe("反面用例", () => {
    test("非法 base64 解码不会崩溃", async () => {
      // Buffer.from 不会抛错，但可能返回乱码
      const result = await tool.handler({ input: "这不是base64!!!", action: "decode" });
      expect(result).toHaveProperty("result");
    });
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      expect(tool.name).toBe("base64");
      expect(tool.riskLevel).toBe("low");
    });
  });
});

// ─── hash ───
describe("hash tool", () => {
  const tool = createHashTool();

  describe("正面用例", () => {
    test("SHA-256（默认）", async () => {
      const result = await tool.handler({ input: "hello" }) as Record<string, string>;
      expect(result.algorithm).toBe("sha256");
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      // 已知值: sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(result.hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    });

    test("SHA-1", async () => {
      const result = await tool.handler({ input: "hello", algorithm: "sha1" }) as Record<string, string>;
      expect(result.algorithm).toBe("sha1");
      expect(result.hash).toMatch(/^[0-9a-f]{40}$/);
      // 已知值: sha1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
      expect(result.hash).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    });

    test("MD5", async () => {
      const result = await tool.handler({ input: "hello", algorithm: "md5" }) as Record<string, string>;
      expect(result.algorithm).toBe("md5");
      expect(result.hash).toMatch(/^[0-9a-f]{32}$/);
      // 已知值: md5("hello") = 5d41402abc4b2a76b9719d911017c592
      expect(result.hash).toBe("5d41402abc4b2a76b9719d911017c592");
    });

    test("大小写算法名", async () => {
      const result = await tool.handler({ input: "test", algorithm: "SHA256" }) as Record<string, string>;
      expect(result.algorithm).toBe("sha256");
    });

    test("空字符串哈希", async () => {
      const result = await tool.handler({ input: "" }) as Record<string, string>;
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("相同输入产生相同哈希", async () => {
      const r1 = await tool.handler({ input: "same" }) as Record<string, string>;
      const r2 = await tool.handler({ input: "same" }) as Record<string, string>;
      expect(r1.hash).toBe(r2.hash);
    });

    test("不同输入产生不同哈希", async () => {
      const r1 = await tool.handler({ input: "abc" }) as Record<string, string>;
      const r2 = await tool.handler({ input: "def" }) as Record<string, string>;
      expect(r1.hash).not.toBe(r2.hash);
    });
  });

  describe("反面用例", () => {
    test("不支持的算法", async () => {
      const result = await tool.handler({ input: "hello", algorithm: "sha512" });
      expect(result).toEqual({ error: "不支持的算法: sha512" });
    });

    test("随机算法名", async () => {
      const result = await tool.handler({ input: "hello", algorithm: "rot13" });
      expect(result).toHaveProperty("error");
      expect((result as Record<string, string>).error).toContain("不支持的算法");
    });
  });

  describe("工具元数据", () => {
    test("名称和风险等级", () => {
      expect(tool.name).toBe("hash");
      expect(tool.riskLevel).toBe("low");
    });
  });
});
