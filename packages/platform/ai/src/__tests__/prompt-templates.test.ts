/**
 * Prompt Template + Model Registry 测试
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPromptTemplates, formatPromptTemplateInvocation, parseCommandArgs, substituteArgs } from "../prompt-templates/loader";
import { createPromptTemplateManager } from "../prompt-templates/manager";
import { createModelRegistry } from "../llm-gateway/model-registry";

describe("Prompt Templates", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pt-test-"));
  });

  test("loadPromptTemplates loads .md files", async () => {
    await writeFile(
      join(tempDir, "greeting.md"),
      `---
description: A greeting template
---
Hello, $1! Welcome to $ARGUMENTS.`,
      "utf-8",
    );

    const result = await loadPromptTemplates(tempDir);
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]!.name).toBe("greeting");
    expect(result.templates[0]!.description).toBe("A greeting template");
  });

  test("formatPromptTemplateInvocation substitutes args", async () => {
    await writeFile(
      join(tempDir, "test.md"),
      `---
description: Test
---
Run $1 on $2 with $@`,
      "utf-8",
    );

    const result = await loadPromptTemplates(tempDir);
    const formatted = formatPromptTemplateInvocation(result.templates[0]!, ["bun", "test"]);
    expect(formatted).toBe("Run bun on test with bun test");
  });

  test("parseCommandArgs handles quotes", () => {
    expect(parseCommandArgs('hello "world foo" bar')).toEqual(["hello", "world foo", "bar"]);
    expect(parseCommandArgs("hello 'world test'")).toEqual(["hello", "world test"]);
  });

  test("substituteArgs handles ${@:N} slices", () => {
    const result = substituteArgs("Args: ${@:2}", ["a", "b", "c", "d"]);
    expect(result).toBe("Args: b c d");
  });

  test("substituteArgs handles ${@:N:L} slices", () => {
    const result = substituteArgs("Args: ${@:2:2}", ["a", "b", "c", "d"]);
    expect(result).toBe("Args: b c");
  });
});

describe("PromptTemplateManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ptm-test-"));
  });

  test("reload loads templates from paths", async () => {
    await writeFile(
      join(tempDir, "hello.md"),
      `---
description: Hello
---
Hi there!`,
      "utf-8",
    );

    const manager = createPromptTemplateManager({ paths: [tempDir] });
    await manager.reload();

    expect(manager.getTemplates()).toHaveLength(1);
    expect(manager.getTemplate("hello")).toBeDefined();
  });

  test("formatInvocation returns null for missing template", () => {
    const manager = createPromptTemplateManager({ paths: [] });
    expect(manager.formatInvocation("nonexistent")).toBeNull();
  });

  test("add and remove template", () => {
    const manager = createPromptTemplateManager({ paths: [] });
    manager.addTemplate({ name: "test", content: "content" });

    expect(manager.getTemplates()).toHaveLength(1);
    expect(manager.formatInvocation("test")).toBe("content");

    manager.removeTemplate("test");
    expect(manager.getTemplates()).toHaveLength(0);
  });
});

describe("ModelRegistry", () => {
  test("has builtin models", () => {
    const registry = createModelRegistry();
    expect(registry.has("gpt-4o")).toBe(true);
    expect(registry.has("claude-sonnet-4-20250514")).toBe(true);
    expect(registry.has("gemini-2.0-flash")).toBe(true);
  });

  test("get resolves provider/model format", () => {
    const registry = createModelRegistry();
    const model = registry.get("openai/gpt-4o");
    expect(model).toBeDefined();
    expect(model!.provider).toBe("openai");
  });

  test("listByProvider filters correctly", () => {
    const registry = createModelRegistry();
    const openaiModels = registry.listByProvider("openai");
    expect(openaiModels.length).toBeGreaterThan(0);
    expect(openaiModels.every((m) => m.provider === "openai")).toBe(true);
  });

  test("custom model overrides builtin", () => {
    const registry = createModelRegistry();
    registry.register({
      id: "gpt-4o",
      name: "Custom GPT-4o",
      provider: "openai",
      contextLength: 256000,
      maxTokens: 32000,
      supportsFunctionCalling: true,
      supportsVision: true,
      supportsReasoning: false,
    });

    const model = registry.get("gpt-4o");
    expect(model!.name).toBe("Custom GPT-4o");
    expect(model!.contextLength).toBe(256000);
  });

  test("empty registry without builtin", () => {
    const registry = createModelRegistry(false);
    expect(registry.list()).toHaveLength(0);
    expect(registry.has("gpt-4o")).toBe(false);
  });
});
