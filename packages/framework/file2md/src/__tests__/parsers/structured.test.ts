import { describe, test, expect } from "bun:test";
import { createStructuredParser } from "../../parsers/structured";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("structured parser", () => {
  const parser = createStructuredParser();

  test("supports JSON/YAML/XML/CSV/TOML", () => {
    expect(parser.canHandle("config.json")).toBe(true);
    expect(parser.canHandle("data.yaml")).toBe(true);
    expect(parser.canHandle("data.yml")).toBe(true);
    expect(parser.canHandle("config.toml")).toBe(true);
    expect(parser.canHandle("feed.xml")).toBe(true);
    expect(parser.canHandle("data.csv")).toBe(true);
    expect(parser.canHandle("data.tsv")).toBe(true);
  });

  test("wraps JSON in json code-fence", async () => {
    const json = '{"name":"test","value":42}';
    const result = await parser.parse({ buffer: Buffer.from(json), fileName: "config.json" }, ctx);
    expect(result.outputs[0]!.content).toContain("```json");
    expect(result.outputs[0]!.content).toContain(json);
    expect(result.outputs[0]!.content).toContain("# config");
  });

  test("wraps CSV in csv code-fence", async () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = await parser.parse({ buffer: Buffer.from(csv), fileName: "users.csv" }, ctx);
    expect(result.outputs[0]!.content).toContain("```csv");
  });

  test("wraps YAML in yaml code-fence", async () => {
    const yaml = "key: value\nlist:\n  - a\n  - b";
    const result = await parser.parse({ buffer: Buffer.from(yaml), fileName: "config.yaml" }, ctx);
    expect(result.outputs[0]!.content).toContain("```yaml");
  });
});
