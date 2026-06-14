import { describe, test, expect } from "bun:test";
import { createCodeParser } from "../../parsers/code";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("code parser", () => {
  const parser = createCodeParser();

  test("supports common programming language extensions", () => {
    expect(parser.canHandle("app.ts")).toBe(true);
    expect(parser.canHandle("main.py")).toBe(true);
    expect(parser.canHandle("index.js")).toBe(true);
    expect(parser.canHandle("lib.go")).toBe(true);
    expect(parser.canHandle("main.rs")).toBe(true);
    expect(parser.canHandle("query.sql")).toBe(true);
    expect(parser.canHandle("style.css")).toBe(true);
    expect(parser.canHandle("file.txt")).toBe(false);
  });

  test("uses correct language identifier in fence", async () => {
    const tsCode = 'const x: string = "hello";';
    const result = await parser.parse({ buffer: Buffer.from(tsCode), fileName: "app.ts" }, ctx);
    expect(result.outputs[0]!.content).toContain("```typescript");
    expect(result.outputs[0]!.content).toContain(tsCode);
  });

  test("maps python correctly", async () => {
    const pyCode = "print('hello')";
    const result = await parser.parse({ buffer: Buffer.from(pyCode), fileName: "main.py" }, ctx);
    expect(result.outputs[0]!.content).toContain("```python");
  });

  test("includes source file reference", async () => {
    const result = await parser.parse({ buffer: Buffer.from("x=1"), fileName: "app.ts" }, ctx);
    expect(result.outputs[0]!.content).toContain("源文件");
    expect(result.outputs[0]!.content).toContain("app.ts");
  });
});
