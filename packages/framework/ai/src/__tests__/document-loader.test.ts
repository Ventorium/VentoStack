import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDocumentsFromDirectory, parseMarkdownFrontmatter } from "../document-loader";
import { createKnowledgeBase } from "../rag";

describe("parseMarkdownFrontmatter", () => {
  test("parses simple frontmatter", () => {
    const content = `---
title: Hello World
description: A test doc
---
This is the body.`;
    const { data, body } = parseMarkdownFrontmatter(content);
    expect(data.title).toBe("Hello World");
    expect(data.description).toBe("A test doc");
    expect(body).toBe("This is the body.");
  });

  test("handles no frontmatter", () => {
    const content = "Just body text.";
    const { data, body } = parseMarkdownFrontmatter(content);
    expect(Object.keys(data)).toHaveLength(0);
    expect(body).toBe("Just body text.");
  });

  test("handles empty frontmatter", () => {
    const content = "---\n---\nBody here.";
    const { data, body } = parseMarkdownFrontmatter(content);
    expect(Object.keys(data)).toHaveLength(0);
    expect(body).toBe("Body here.");
  });

  test("removes YAML quotes", () => {
    const content = `---
title: "Quoted Title"
---
Body.`;
    const { data } = parseMarkdownFrontmatter(content);
    expect(data.title).toBe("Quoted Title");
  });

  test("ignores comments in frontmatter", () => {
    const content = `---
# This is a comment
title: Real Title
---
Body.`;
    const { data } = parseMarkdownFrontmatter(content);
    expect(data.title).toBe("Real Title");
    expect(data["# This is a comment"]).toBeUndefined();
  });
});

describe("loadDocumentsFromDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ai-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loads markdown files into knowledge base", async () => {
    writeFileSync(
      join(tmpDir, "doc1.md"),
      `---
title: Routing Guide
---
# Routing

VentoStack uses createRouter to define routes.

## Example

Here is an example of defining a route.`,
    );

    const kb = createKnowledgeBase();
    const result = await loadDocumentsFromDirectory(tmpDir, kb, { chunkSize: 100, overlap: 0 });

    expect(result.loaded).toBe(1);
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    expect(kb.size()).toBe(result.chunks);

    // Verify metadata
    const docs = kb.list();
    expect(docs[0]!.metadata!.title).toBe("Routing Guide");
    expect(docs[0]!.metadata!.source).toContain("doc1.md");
  });

  test("skips files not matching includePattern", async () => {
    writeFileSync(join(tmpDir, "include.md"), "# Include\nThis should be included.");
    writeFileSync(join(tmpDir, "exclude.md"), "# Exclude\nThis should be excluded.");

    const kb = createKnowledgeBase();
    const result = await loadDocumentsFromDirectory(tmpDir, kb, {
      includePattern: /include\.md$/,
    });

    expect(result.loaded).toBe(1);
    expect(kb.size()).toBe(1);
  });

  test("returns error for unreadable files gracefully", async () => {
    writeFileSync(join(tmpDir, "valid.md"), "# Valid\nContent.");
    // Create an unreadable file by removing read permission
    const badFile = join(tmpDir, "unreadable.md");
    writeFileSync(badFile, "secret");
    const { chmodSync } = await import("node:fs");
    chmodSync(badFile, 0o000);

    const kb = createKnowledgeBase();
    const result = await loadDocumentsFromDirectory(tmpDir, kb);

    // Restore permission so cleanup can remove the file
    chmodSync(badFile, 0o644);

    // root can read any file regardless of permissions, so loaded may be 1 or 2
    expect(result.loaded).toBeGreaterThanOrEqual(1);
    // errors may be 0 when running as root (chmod has no effect)
    if (result.loaded === 1) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test("infers category from path", async () => {
    const subDir = join(tmpDir, "content", "docs", "core");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "router.md"), "# Router\nRouter docs.");

    const kb = createKnowledgeBase();
    await loadDocumentsFromDirectory(tmpDir, kb);

    const docs = kb.list();
    expect(docs[0]!.metadata!.category).toBe("core");
  });

  test("handles mdx files", async () => {
    writeFileSync(join(tmpDir, "page.mdx"), "---\ntitle: MDX Page\n---\n# MDX\nContent here.");

    const kb = createKnowledgeBase();
    const result = await loadDocumentsFromDirectory(tmpDir, kb);

    expect(result.loaded).toBe(1);
    expect(kb.size()).toBeGreaterThan(0);
  });

  test("returns empty result for empty directory", async () => {
    const kb = createKnowledgeBase();
    const result = await loadDocumentsFromDirectory(tmpDir, kb);

    expect(result.loaded).toBe(0);
    expect(result.chunks).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
