import { describe, test, expect } from "bun:test";
import { parseYAML, stringifyYAML } from "../yaml-config";

describe("parseYAML", () => {
  test("parses key-value pairs", () => {
    const result = parseYAML("name: hello\nport: 3000");
    expect(result.name).toBe("hello");
    expect(result.port).toBe(3000);
  });

  test("parses boolean values", () => {
    const result = parseYAML("debug: true\nverbose: false");
    expect(result.debug).toBe(true);
    expect(result.verbose).toBe(false);
  });

  test("parses null values", () => {
    const result = parseYAML("value: null\nother: ~");
    expect(result.value).toBeNull();
    expect(result.other).toBeNull();
  });

  test("parses quoted strings", () => {
    const result = parseYAML('name: "hello world"\nother: \'single\'');
    expect(result.name).toBe("hello world");
    expect(result.other).toBe("single");
  });

  test("parses nested objects", () => {
    const result = parseYAML("database:\n  host: localhost\n  port: 5432");
    expect(result.database).toEqual({ host: "localhost", port: 5432 });
  });

  test("parses arrays", () => {
    const result = parseYAML("tags:\n  - alpha\n  - beta\n  - gamma");
    expect(result.tags).toEqual(["alpha", "beta", "gamma"]);
  });

  test("skips comments", () => {
    const result = parseYAML("# comment\nname: test\n# another");
    expect(result.name).toBe("test");
  });

  test("skips empty lines", () => {
    const result = parseYAML("\nname: test\n\nport: 3000\n");
    expect(result.name).toBe("test");
    expect(result.port).toBe(3000);
  });
});

describe("stringifyYAML", () => {
  test("serializes simple values", () => {
    const yaml = stringifyYAML({ name: "test", port: 3000, debug: true });
    expect(yaml).toContain("name: test");
    expect(yaml).toContain("port: 3000");
    expect(yaml).toContain("debug: true");
  });

  test("serializes null", () => {
    const yaml = stringifyYAML({ value: null });
    expect(yaml).toContain("value: null");
  });

  test("serializes nested objects", () => {
    const yaml = stringifyYAML({ db: { host: "localhost" } });
    expect(yaml).toContain("db:");
    expect(yaml).toContain("  host: localhost");
  });

  test("serializes arrays", () => {
    const yaml = stringifyYAML({ tags: ["a", "b"] });
    expect(yaml).toContain("tags:");
    expect(yaml).toContain("  - a");
    expect(yaml).toContain("  - b");
  });

  test("quotes strings with colons", () => {
    const yaml = stringifyYAML({ url: "http://localhost:3000" });
    expect(yaml).toContain('"http://localhost:3000"');
  });
});
