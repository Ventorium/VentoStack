import { describe, test, expect } from "bun:test";
import { createTextParser } from "../../parsers/text";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("text parser", () => {
  const parser = createTextParser();

  test("supports txt/log/ini/cfg/env/conf extensions", () => {
    expect(parser.canHandle("readme.txt")).toBe(true);
    expect(parser.canHandle("app.log")).toBe(true);
    expect(parser.canHandle("config.ini")).toBe(true);
    expect(parser.canHandle(".env")).toBe(true);
    expect(parser.canHandle("file.pdf")).toBe(false);
  });

  test("parses txt file with code-fence wrapper", async () => {
    const buffer = Buffer.from("Hello World\nLine 2");
    const result = await parser.parse({ buffer, fileName: "readme.txt" }, ctx);

    expect(result.parser).toBe("text");
    expect(result.sourceFileName).toBe("readme.txt");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.relativePath).toBe("readme.md");
    expect(result.outputs[0]!.content).toContain("# readme");
    expect(result.outputs[0]!.content).toContain("```txt");
    expect(result.outputs[0]!.content).toContain("Hello World\nLine 2");
    expect(result.outputs[0]!.content).toContain("```");
  });

  test("preserves file extension in fence tag", async () => {
    const buffer = Buffer.from("key=value");
    const result = await parser.parse({ buffer, fileName: ".env" }, ctx);
    expect(result.outputs[0]!.content).toContain("```env");
  });

  test("handles empty file", async () => {
    const buffer = Buffer.from("");
    const result = await parser.parse({ buffer, fileName: "empty.txt" }, ctx);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toContain("```txt");
  });
});
