import { describe, test, expect } from "bun:test";
import { createHtmlParser } from "../../parsers/html";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("html parser", () => {
  const parser = createHtmlParser();

  test("supports .html and .htm", () => {
    expect(parser.canHandle("page.html")).toBe(true);
    expect(parser.canHandle("page.htm")).toBe(true);
    expect(parser.canHandle("page.xhtml")).toBe(true);
    expect(parser.canHandle("file.txt")).toBe(false);
  });

  test("converts basic HTML to markdown", async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Main Title</h1>
  <p>Hello <strong>world</strong> and <em>everyone</em>.</p>
  <h2>Section</h2>
  <p>Some <a href="https://example.com">link</a> here.</p>
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</body>
</html>`;

    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "page.html" }, ctx);
    const md = result.outputs[0]!.content;

    expect(md).toContain("# Main Title");
    expect(md).toContain("**world**");
    expect(md).toContain("*everyone*");
    expect(md).toContain("## Section");
    expect(md).toContain("[link](https://example.com)");
    expect(md).toContain("- Item 1");
    expect(md).toContain("- Item 2");
    // Should NOT contain HTML tags
    expect(md).not.toContain("<h1>");
    expect(md).not.toContain("<strong>");
  });

  test("strips script and style tags", async () => {
    const html = `<html>
<head><style>body { color: red; }</style></head>
<body>
  <script>alert('xss')</script>
  <p>Content here</p>
</body></html>`;

    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "test.html" }, ctx);
    const md = result.outputs[0]!.content;

    expect(md).not.toContain("alert");
    expect(md).not.toContain("color: red");
    expect(md).toContain("Content here");
  });
});
