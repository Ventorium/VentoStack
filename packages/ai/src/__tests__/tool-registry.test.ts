import { describe, test, expect } from "bun:test";
import { createToolRegistry } from "../tool-registry";
import type { ToolDefinition } from "../tool-registry";

function makeTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "test-tool",
    description: "A test tool",
    parameters: [
      { name: "input", type: "string", description: "Input value", required: true },
    ],
    handler: async (params) => ({ echo: params["input"] }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  test("register + get", () => {
    const registry = createToolRegistry();
    const tool = makeTool();
    registry.register(tool);
    expect(registry.get("test-tool")).toBe(tool);
  });

  test("register 重名抛错", () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    expect(() => registry.register(makeTool())).toThrow('Tool "test-tool" is already registered');
  });

  test("unregister", () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    expect(registry.unregister("test-tool")).toBe(true);
    expect(registry.get("test-tool")).toBeUndefined();
    expect(registry.unregister("test-tool")).toBe(false);
  });

  test("list 全部", () => {
    const registry = createToolRegistry();
    registry.register(makeTool({ name: "a", description: "A" }));
    registry.register(makeTool({ name: "b", description: "B" }));
    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name).sort()).toEqual(["a", "b"]);
  });

  test("execute 成功", async () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    const result = await registry.execute("test-tool", { input: "hello" });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ echo: "hello" });
    expect(result.toolName).toBe("test-tool");
    expect(result.timestamp).toBeGreaterThan(0);
  });

  test("execute 超时", async () => {
    const registry = createToolRegistry();
    registry.register(
      makeTool({
        timeout: 50,
        handler: () => new Promise((resolve) => setTimeout(resolve, 200)),
      }),
    );
    const result = await registry.execute("test-tool", { input: "hello" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });

  test("execute 记录 duration", async () => {
    const registry = createToolRegistry();
    registry.register(
      makeTool({
        handler: async () => {
          await new Promise((r) => setTimeout(r, 20));
          return "done";
        },
      }),
    );
    const result = await registry.execute("test-tool", { input: "hello" });
    expect(result.duration).toBeGreaterThan(0);
  });

  test("validateParams 通过", () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    const { valid, errors } = registry.validateParams("test-tool", { input: "hello" });
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test("validateParams 缺少必需参数", () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    const { valid, errors } = registry.validateParams("test-tool", {});
    expect(valid).toBe(false);
    expect(errors[0]).toContain("Missing required parameter");
  });

  test("validateParams 类型错误", () => {
    const registry = createToolRegistry();
    registry.register(makeTool());
    const { valid, errors } = registry.validateParams("test-tool", { input: 123 });
    expect(valid).toBe(false);
    expect(errors[0]).toContain('expected type "string"');
  });

  test("toJSONSchema 格式", () => {
    const registry = createToolRegistry();
    registry.register(
      makeTool({
        parameters: [
          { name: "query", type: "string", description: "Search query", required: true },
          { name: "limit", type: "number", description: "Max results" },
        ],
      }),
    );
    const schemas = registry.toJSONSchema();
    expect(schemas).toHaveLength(1);
    expect(schemas[0]!.name).toBe("test-tool");
    expect(schemas[0]!.parameters.type).toBe("object");
    expect(schemas[0]!.parameters.properties["query"]).toEqual({
      type: "string",
      description: "Search query",
    });
    expect(schemas[0]!.parameters.required).toEqual(["query"]);
  });

  test("execute 不存在的 tool", async () => {
    const registry = createToolRegistry();
    const result = await registry.execute("nonexistent", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("validateParams 对不存在的 tool 返回错误", () => {
    const registry = createToolRegistry();
    const { valid, errors } = registry.validateParams("nonexistent", {});
    expect(valid).toBe(false);
    expect(errors[0]).toContain("not found");
  });

  test("execute handler 抛错", async () => {
    const registry = createToolRegistry();
    registry.register(
      makeTool({
        handler: async () => {
          throw new Error("handler failed");
        },
      }),
    );
    const result = await registry.execute("test-tool", { input: "hello" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("handler failed");
  });
});
