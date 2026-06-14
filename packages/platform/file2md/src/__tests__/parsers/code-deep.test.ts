import { describe, test, expect } from "bun:test";
import { createCodeParser } from "../../parsers/code";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("code parser — deep tests", () => {
  const parser = createCodeParser();

  test("maps all expected language identifiers", async () => {
    const cases: [string, string][] = [
      ["app.ts", "typescript"],
      ["comp.tsx", "tsx"],
      ["index.js", "javascript"],
      ["comp.jsx", "jsx"],
      ["main.py", "python"],
      ["lib.go", "go"],
      ["main.rs", "rust"],
      ["App.java", "java"],
      ["main.c", "c"],
      ["impl.cpp", "cpp"],
      ["Program.cs", "csharp"],
      ["style.css", "css"],
      ["style.scss", "scss"],
      ["query.sql", "sql"],
      ["deploy.sh", "bash"],
      ["page.vue", "vue"],
      ["page.svelte", "svelte"],
    ];
    for (const [file, expectedLang] of cases) {
      const result = await parser.parse({ buffer: Buffer.from("code"), fileName: file }, ctx);
      expect(result.outputs[0]!.content).toContain("```" + expectedLang);
    }
  });

  test("handles multi-line code with special characters", async () => {
    const code = `function greet(name: string) {
  const msg = \`Hello, \${name}!\`;
  console.log(msg);
  return msg;
}`;
    const result = await parser.parse({ buffer: Buffer.from(code), fileName: "greet.ts" }, ctx);
    expect(result.outputs[0]!.content).toContain("```typescript");
    expect(result.outputs[0]!.content).toContain("function greet");
    expect(result.outputs[0]!.content).toContain("console.log");
  });

  test("handles empty code file", async () => {
    const result = await parser.parse({ buffer: Buffer.from(""), fileName: "empty.ts" }, ctx);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toContain("```typescript");
  });

  test("handles code with unicode characters", async () => {
    const code = '// 中文注释\nconst msg = "こんにちは";';
    const result = await parser.parse({ buffer: Buffer.from(code), fileName: "i18n.ts" }, ctx);
    expect(result.outputs[0]!.content).toContain("中文注释");
    expect(result.outputs[0]!.content).toContain("こんにちは");
  });

  test("metadata includes language and size", async () => {
    const code = "const x = 1;";
    const result = await parser.parse({ buffer: Buffer.from(code), fileName: "app.ts" }, ctx);
    expect(result.metadata.language).toBe("typescript");
    expect(result.metadata.size).toBe(code.length);
  });
});
