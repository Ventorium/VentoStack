import { describe, test, expect } from "bun:test";
import { createHtmlParser } from "../../parsers/html";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("html parser — deep tests", () => {
  const parser = createHtmlParser();

  test("handles tables in HTML", async () => {
    const html = `<html><body>
      <table>
        <tr><th>Name</th><th>Age</th></tr>
        <tr><td>Alice</td><td>30</td></tr>
        <tr><td>Bob</td><td>25</td></tr>
      </table>
    </body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "table.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("| Alice | 30 |");
  });

  test("handles images in HTML", async () => {
    const html = `<html><body><img src="photo.jpg" alt="A photo"/></body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "img.html" }, ctx);
    expect(result.outputs[0]!.content).toContain("![A photo](photo.jpg)");
  });

  test("handles images without alt text", async () => {
    const html = `<html><body><img src="pic.png"/></body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "pic.html" }, ctx);
    expect(result.outputs[0]!.content).toContain("![](pic.png)");
  });

  test("handles nested inline formatting", async () => {
    const html = `<html><body><p><strong>bold <em>and italic</em></strong></p></body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "fmt.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("**bold");
    expect(md).toContain("*and italic*");
  });

  test("handles multiple heading levels", async () => {
    const html = `<html><body>
      <h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>
    </body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "headings.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("# H1");
    expect(md).toContain("## H2");
    expect(md).toContain("### H3");
    expect(md).toContain("#### H4");
    expect(md).toContain("##### H5");
    expect(md).toContain("###### H6");
  });

  test("strips nav, header, footer, noscript", async () => {
    const html = `<html>
      <header>Site Header</header>
      <nav>Navigation Menu</nav>
      <body><p>Main Content</p></body>
      <footer>Site Footer</footer>
      <noscript>JS Required</noscript>
    </html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "full.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("Main Content");
    expect(md).not.toContain("Site Header");
    expect(md).not.toContain("Navigation Menu");
    expect(md).not.toContain("Site Footer");
    expect(md).not.toContain("JS Required");
  });

  test("strips HTML comments", async () => {
    const html = `<html><body>
      <p>Visible</p>
      <!-- This is a comment -->
      <p>Also visible</p>
    </body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "comments.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("Visible");
    expect(md).not.toContain("This is a comment");
  });

  test("handles horizontal rules", async () => {
    const html = `<html><body><p>A</p><hr/><p>B</p></body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "hr.html" }, ctx);
    expect(result.outputs[0]!.content).toContain("---");
  });

  test("handles ordered and unordered lists", async () => {
    const html = `<html><body>
      <ul><li>Unordered 1</li><li>Unordered 2</li></ul>
    </body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "lists.html" }, ctx);
    const md = result.outputs[0]!.content;
    expect(md).toContain("- Unordered 1");
    expect(md).toContain("- Unordered 2");
  });

  test("uses title tag as heading when no h1", async () => {
    const html = `<html><head><title>Page Title</title></head><body><p>Content</p></body></html>`;
    const result = await parser.parse({ buffer: Buffer.from(html), fileName: "titled.html" }, ctx);
    expect(result.outputs[0]!.content).toContain("# Page Title");
  });

  test("handles .xhtml extension", () => {
    expect(parser.canHandle("page.xhtml")).toBe(true);
  });
});
