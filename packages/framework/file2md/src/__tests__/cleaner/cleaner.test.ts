import { describe, test, expect } from "bun:test";
import { createMarkdownCleaner } from "../../cleaner";
import type { CleanerContext } from "../../types";

const ctx: CleanerContext = { fileName: "test.md", metadata: {} };

describe("markdown cleaner", () => {
  test("removes excessive blank lines", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["blank-lines"] });
    const input = "Hello\n\n\n\n\n\nWorld";
    expect(cleaner.clean(input, ctx)).toBe("Hello\n\nWorld");
  });

  test("removes trailing whitespace", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["whitespace"] });
    const input = "Hello   \nWorld\t  ";
    expect(cleaner.clean(input, ctx)).toBe("Hello\nWorld");
  });

  test("removes control characters", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["whitespace"] });
    const input = "Hello\x00\x01World";
    expect(cleaner.clean(input, ctx)).toBe("HelloWorld");
  });

  test("resolves HTML entities", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["html-artifacts"] });
    const input = "Hello&nbsp;World &amp; Friends";
    expect(cleaner.clean(input, ctx)).toBe("Hello World & Friends");
  });

  test("removes empty headings", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["headings"] });
    const input = "# Title\n\n## \n\nContent here";
    const result = cleaner.clean(input, ctx);
    expect(result).toContain("# Title");
    expect(result).toContain("Content here");
    expect(result).not.toContain("## ");
  });

  test("normalizes list markers", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["lists"] });
    const input = "* Item 1\n• Item 2\n· Item 3";
    expect(cleaner.clean(input, ctx)).toBe("- Item 1\n- Item 2\n- Item 3");
  });

  test("removes boilerplate page numbers", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["boilerplate"] });
    const input = "Content\n\n第1页，共10页\n\nMore content";
    const result = cleaner.clean(input, ctx);
    expect(result).toContain("Content");
    expect(result).toContain("More content");
    expect(result).not.toContain("第1页");
  });

  test("removes duplicate consecutive paragraphs", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["duplicates"] });
    const input = "First\n\nRepeated paragraph\n\nRepeated paragraph\n\nLast";
    expect(cleaner.clean(input, ctx)).toBe("First\n\nRepeated paragraph\n\nLast");
  });

  test("removes empty links", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["link-cleanup"] });
    const input = "Click [here]() for more";
    expect(cleaner.clean(input, ctx)).toBe("Click here for more");
  });

  test("unicode NFC normalization and fullwidth conversion", () => {
    const cleaner = createMarkdownCleaner({ enabledRules: ["unicode"] });
    const input = "１２３abc";
    expect(cleaner.clean(input, ctx)).toBe("123abc");
  });

  test("full pipeline applies all rules in order", () => {
    const cleaner = createMarkdownCleaner();
    const input = [
      "# Title",
      "",
      "Hello&nbsp;World   ",
      "",
      "Content",
      "",
      "第1页，共10页",
    ].join("\n");

    const result = cleaner.clean(input, ctx);
    expect(result).toContain("# Title");
    expect(result).toContain("Hello World");
    expect(result).not.toContain("&nbsp;");
    expect(result).toContain("Content");
    expect(result).not.toContain("第1页");
  });

  test("disabled rules are skipped", () => {
    // Disable all rules except one that doesn't touch blank lines
    const cleaner = createMarkdownCleaner({ enabledRules: ["unicode"] });
    const input = "Hello\n\n\n\nWorld";
    // Unicode rule doesn't collapse blank lines
    expect(cleaner.clean(input, ctx)).toBe("Hello\n\n\n\nWorld");
  });

  test("enabled=false returns input unchanged", () => {
    const cleaner = createMarkdownCleaner({ enabled: false });
    const input = "Hello\n\n\n\n\n\nWorld";
    expect(cleaner.clean(input, ctx)).toBe(input);
  });

  test("listRules returns active rules", () => {
    const cleaner = createMarkdownCleaner();
    const rules = cleaner.listRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some((r) => r.name === "blank-lines")).toBe(true);
    expect(rules.some((r) => r.name === "unicode")).toBe(true);
  });

  test("addRule adds custom rule", () => {
    const cleaner = createMarkdownCleaner();
    const countBefore = cleaner.listRules().length;
    cleaner.addRule({
      name: "custom",
      description: "test",
      priority: 999,
      clean: (md) => md.replace(/CUSTOM/g, "REPLACED"),
    });
    expect(cleaner.listRules().length).toBe(countBefore + 1);
  });
});
