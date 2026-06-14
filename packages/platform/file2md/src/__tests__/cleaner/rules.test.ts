import { describe, test, expect } from "bun:test";
import { unicodeRule } from "../../cleaner/rules/unicode";
import { whitespaceRule } from "../../cleaner/rules/whitespace";
import { htmlArtifactsRule } from "../../cleaner/rules/html-artifacts";
import { blankLinesRule } from "../../cleaner/rules/blank-lines";
import { headingsRule } from "../../cleaner/rules/headings";
import { listsRule } from "../../cleaner/rules/lists";
import { tablesRule } from "../../cleaner/rules/tables";
import { boilerplateRule } from "../../cleaner/rules/boilerplate";
import { duplicatesRule } from "../../cleaner/rules/duplicates";
import { linkCleanupRule } from "../../cleaner/rules/link-cleanup";
import type { CleanerContext } from "../../types";

const ctx: CleanerContext = { fileName: "test.md", metadata: {} };

describe("individual cleaner rules", () => {
  // ── unicode ──
  describe("unicode rule", () => {
    test("has correct metadata", () => {
      expect(unicodeRule.name).toBe("unicode");
      expect(unicodeRule.priority).toBeLessThan(50);
    });

    test("removes zero-width characters", () => {
      expect(unicodeRule.clean("Hello\u200BWorld", ctx)).toBe("HelloWorld");
      expect(unicodeRule.clean("A\uFEFFB", ctx)).toBe("AB");
      expect(unicodeRule.clean("X\u200DY", ctx)).toBe("XY");
    });

    test("converts fullwidth digits to halfwidth", () => {
      expect(unicodeRule.clean("１２３４５", ctx)).toBe("12345");
    });

    test("converts fullwidth letters to halfwidth", () => {
      expect(unicodeRule.clean("ＡＢＣ", ctx)).toBe("ABC");
      expect(unicodeRule.clean("ａｂｃ", ctx)).toBe("abc");
    });

    test("preserves normal text", () => {
      expect(unicodeRule.clean("Hello 世界", ctx)).toBe("Hello 世界");
    });
  });

  // ── whitespace ──
  describe("whitespace rule", () => {
    test("removes control characters", () => {
      expect(whitespaceRule.clean("A\x00B\x01C\x1fD", ctx)).toBe("ABCD");
    });

    test("converts tabs to spaces", () => {
      expect(whitespaceRule.clean("col1\tcol2\tcol3", ctx)).toBe("col1  col2  col3");
    });

    test("removes trailing whitespace", () => {
      expect(whitespaceRule.clean("line1   \nline2\t\n", ctx)).toBe("line1\nline2\n");
    });

    test("preserves newlines", () => {
      expect(whitespaceRule.clean("a\nb\nc", ctx)).toBe("a\nb\nc");
    });
  });

  // ── html-artifacts ──
  describe("html-artifacts rule", () => {
    test("decodes common HTML entities", () => {
      expect(htmlArtifactsRule.clean("a&nbsp;b&amp;c&lt;d&gt;e&quot;f&#39;g", ctx))
        .toBe("a b&c<d>e\"f'g");
    });

    test("removes empty HTML tags", () => {
      expect(htmlArtifactsRule.clean("<div>text</div>", ctx)).toBe("text");
      expect(htmlArtifactsRule.clean("<span class='x'>content</span>", ctx)).toBe("content");
    });

    test("converts <br> to newline", () => {
      expect(htmlArtifactsRule.clean("line1<br>line2", ctx)).toBe("line1\nline2");
      expect(htmlArtifactsRule.clean("line1<br/>line2", ctx)).toBe("line1\nline2");
      expect(htmlArtifactsRule.clean("line1<br />line2", ctx)).toBe("line1\nline2");
    });

    test("removes unknown HTML entities", () => {
      expect(htmlArtifactsRule.clean("text&unknown;more", ctx)).toBe("textmore");
    });
  });

  // ── blank-lines ──
  describe("blank-lines rule", () => {
    test("collapses 3+ blank lines to 2", () => {
      expect(blankLinesRule.clean("a\n\n\nb", ctx)).toBe("a\n\nb");
      expect(blankLinesRule.clean("a\n\n\n\n\nb", ctx)).toBe("a\n\nb");
    });

    test("preserves single and double newlines", () => {
      expect(blankLinesRule.clean("a\nb", ctx)).toBe("a\nb");
      expect(blankLinesRule.clean("a\n\nb", ctx)).toBe("a\n\nb");
    });

    test("handles text with only blank lines", () => {
      expect(blankLinesRule.clean("\n\n\n\n", ctx)).toBe("\n\n");
    });
  });

  // ── headings ──
  describe("headings rule", () => {
    test("removes empty headings", () => {
      const result = headingsRule.clean("# Title\n## \n### Content", ctx);
      expect(result).toContain("# Title");
      expect(result).toContain("### Content");
      // ## was removed (empty), so it won't appear
      expect(result).not.toMatch(/^##\s+$/m);
    });

    test("keeps non-empty headings", () => {
      const input = "# H1\n## H2\n### H3";
      expect(headingsRule.clean(input, ctx)).toBe(input);
    });

    test("warns on heading level jumps", () => {
      const result = headingsRule.clean("# H1\n### H3", ctx);
      expect(result).toContain("标题层级跳跃");
    });

    test("handles no headings", () => {
      expect(headingsRule.clean("plain text\nmore text", ctx)).toBe("plain text\nmore text");
    });
  });

  // ── lists ──
  describe("lists rule", () => {
    test("converts * to -", () => {
      expect(listsRule.clean("* A\n* B", ctx)).toBe("- A\n- B");
    });

    test("converts bullet chars to -", () => {
      expect(listsRule.clean("• A\n· B", ctx)).toBe("- A\n- B");
    });

    test("removes empty list items", () => {
      const result = listsRule.clean("- item\n- \n- another", ctx);
      expect(result).toContain("- item");
      expect(result).toContain("- another");
      expect(result).not.toContain("- \n");
    });

    test("preserves ordered lists", () => {
      expect(listsRule.clean("1. First\n2. Second", ctx)).toBe("1. First\n2. Second");
    });
  });

  // ── tables ──
  describe("tables rule", () => {
    test("removes all-empty table rows", () => {
      const input = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| | |";
      const result = tablesRule.clean(input, ctx);
      expect(result).toContain("| A | B |");
      expect(result).toContain("| 1 | 2 |");
      expect(result).not.toContain("| | |");
    });

    test("preserves separator rows and data rows", () => {
      const input = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
      const result = tablesRule.clean(input, ctx);
      expect(result).toContain("| Name | Age |");
      expect(result).toContain("| --- | --- |");
      expect(result).toContain("| Alice | 30 |");
    });

    test("ignores non-table lines", () => {
      const input = "Hello world\nNot a table\nMore text";
      expect(tablesRule.clean(input, ctx)).toBe(input);
    });
  });

  // ── boilerplate ──
  describe("boilerplate rule", () => {
    test("removes page number patterns", () => {
      expect(boilerplateRule.clean("第1页，共10页", ctx)).toBe("");
      expect(boilerplateRule.clean("第 5 页/共 20 页", ctx)).toBe("");
      expect(boilerplateRule.clean("Page 1 of 10", ctx)).toBe("");
      expect(boilerplateRule.clean("Page 5", ctx)).toBe("");
    });

    test("removes copyright notices", () => {
      expect(boilerplateRule.clean("版权所有 2024 某某公司", ctx)).toBe("");
      expect(boilerplateRule.clean("Copyright 2024 Acme Corp", ctx)).toBe("");
    });

    test("removes confidentiality watermarks", () => {
      expect(boilerplateRule.clean("仅供内部使用", ctx)).toBe("");
      expect(boilerplateRule.clean("Confidential - Do Not Distribute", ctx)).toBe("");
      expect(boilerplateRule.clean("Internal Use Only", ctx)).toBe("");
    });

    test("preserves normal content", () => {
      const content = "This is real content that should not be removed.";
      expect(boilerplateRule.clean(content, ctx)).toBe(content);
    });
  });

  // ── duplicates ──
  describe("duplicates rule", () => {
    test("removes exact duplicate paragraphs", () => {
      const input = "First\n\nDuplicate\n\nDuplicate\n\nLast";
      expect(duplicatesRule.clean(input, ctx)).toBe("First\n\nDuplicate\n\nLast");
    });

    test("preserves different paragraphs", () => {
      const input = "First\n\nSecond\n\nThird";
      expect(duplicatesRule.clean(input, ctx)).toBe(input);
    });

    test("handles single paragraph", () => {
      expect(duplicatesRule.clean("Only one", ctx)).toBe("Only one");
    });

    test("removes similar paragraphs (>80% match)", () => {
      // Two paragraphs that are very similar but not identical
      const base = "This is a long paragraph with enough content to trigger the similarity check. ".repeat(3);
      const similar = base.replace("long", "lengthy");
      const input = `${base}\n\n${similar}\n\nDifferent content`;
      const result = duplicatesRule.clean(input, ctx);
      expect(result).not.toContain("lengthy");
      expect(result).toContain("Different content");
    });
  });

  // ── link-cleanup ──
  describe("link-cleanup rule", () => {
    test("removes empty links", () => {
      expect(linkCleanupRule.clean("[click]()", ctx)).toBe("click");
    });

    test("removes empty images", () => {
      expect(linkCleanupRule.clean("![]()", ctx)).toBe("");
    });

    test("removes Word media references", () => {
      expect(linkCleanupRule.clean("![img](word/media/image1.png)", ctx)).toBe("");
    });

    test("preserves valid links", () => {
      expect(linkCleanupRule.clean("[Google](https://google.com)", ctx))
        .toBe("[Google](https://google.com)");
    });

    test("preserves valid images", () => {
      expect(linkCleanupRule.clean("![Logo](https://example.com/logo.png)", ctx))
        .toBe("![Logo](https://example.com/logo.png)");
    });
  });
});
