import { describe, test, expect } from "bun:test";
import { parseMarkdown, extractWikiLinks } from "../../knowledge-base/markdown-parser";

describe("knowledge-base markdown parser", () => {
  test("parses frontmatter and body", () => {
    const content = `---
title: Hello
tags: test
---
Body content here`;
    const result = parseMarkdown(content);
    expect(result.frontmatter.title).toBe("Hello");
    expect(result.frontmatter.tags).toBe("test");
    expect(result.body).toContain("Body content here");
  });

  test("extracts wiki links", () => {
    const content = "See [[Other Page]] and [[Another Doc]] for details.";
    const links = extractWikiLinks(content);
    expect(links).toContain("Other Page");
    expect(links).toContain("Another Doc");
    expect(links.length).toBe(2);
  });

  test("handles content without frontmatter", () => {
    const content = "Just plain content";
    const result = parseMarkdown(content);
    expect(Object.keys(result.frontmatter).length).toBe(0);
    expect(result.body).toBe("Just plain content");
  });

  test("handles empty wiki links", () => {
    const content = "No links here";
    const links = extractWikiLinks(content);
    expect(links.length).toBe(0);
  });
});
