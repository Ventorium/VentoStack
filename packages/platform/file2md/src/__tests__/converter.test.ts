import { describe, test, expect } from "bun:test";
import { createConverter } from "../converter";

describe("converter", () => {
  test("getSupportedFormats returns all supported extensions", () => {
    const converter = createConverter();
    const formats = converter.getSupportedFormats();

    expect(formats).toContain(".md");
    expect(formats).toContain(".txt");
    expect(formats).toContain(".ts");
    expect(formats).toContain(".pdf");
    expect(formats).toContain(".docx");
    expect(formats).toContain(".xlsx");
    expect(formats).toContain(".pptx");
    expect(formats).toContain(".html");
    expect(formats).toContain(".png");
    expect(formats).toContain(".zip");
    expect(formats).toContain(".epub");
  });

  test("convertFile handles markdown file", async () => {
    const converter = createConverter();
    const md = "# Hello\n\nWorld";
    const result = await converter.convertFile(Buffer.from(md), "test.md");

    expect(result.parser).toBe("markdown");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.content).toBe(md);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test("convertFile handles text file with code-fence", async () => {
    const converter = createConverter();
    const result = await converter.convertFile(Buffer.from("hello world"), "readme.txt");

    expect(result.parser).toBe("text");
    expect(result.outputs[0]!.content).toContain("```txt");
    expect(result.outputs[0]!.content).toContain("hello world");
  });

  test("convertFile handles code file", async () => {
    const converter = createConverter();
    const code = 'const x = 1;';
    const result = await converter.convertFile(Buffer.from(code), "app.ts");

    expect(result.parser).toBe("code");
    expect(result.outputs[0]!.content).toContain("```typescript");
  });

  test("convertFile handles JSON file", async () => {
    const converter = createConverter();
    const json = '{"key": "value"}';
    const result = await converter.convertFile(Buffer.from(json), "config.json");

    expect(result.parser).toBe("structured");
    expect(result.outputs[0]!.content).toContain("```json");
  });

  test("convertFile throws for audio/video files", async () => {
    const converter = createConverter();
    await expect(
      converter.convertFile(Buffer.from("fake"), "song.mp3")
    ).rejects.toThrow("音视频文件");
  });

  test("convertFile throws for unknown formats", async () => {
    const converter = createConverter();
    await expect(
      converter.convertFile(Buffer.from("data"), "file.xyz")
    ).rejects.toThrow("不支持的文件格式");
  });

  test("convertFile enforces max file size", async () => {
    const converter = createConverter({ maxFileSize: 100 });
    const bigBuffer = Buffer.alloc(200);
    await expect(
      converter.convertFile(bigBuffer, "big.txt")
    ).rejects.toThrow("超过限制");
  });

  test("convertFile applies cleaning by default", async () => {
    const converter = createConverter();
    const md = "Hello\n\n\n\n\n\nWorld";
    const result = await converter.convertFile(Buffer.from(md), "test.md");
    expect(result.outputs[0]!.content).not.toMatch(/\n{3,}/);
  });

  test("convertFile skips cleaning when disabled", async () => {
    const converter = createConverter();
    const md = "Hello\n\n\n\n\n\nWorld";
    const result = await converter.convertFile(Buffer.from(md), "test.md", {
      cleaner: { enabled: false },
    });
    expect(result.outputs[0]!.content).toMatch(/\n{5,}/);
  });

  test("progress events are emitted", async () => {
    const converter = createConverter();
    const events: string[] = [];

    await converter.convertFile(Buffer.from("# Hello"), "test.md", {
      onProgress: (e) => events.push(e.type),
    });

    expect(events).toContain("start");
    expect(events).toContain("complete");
  });

  test("convertBatch processes multiple files", async () => {
    const converter = createConverter();
    const results = await converter.convertBatch([
      { buffer: Buffer.from("# Hello"), fileName: "a.md" },
      { buffer: Buffer.from("world"), fileName: "b.txt" },
      { buffer: Buffer.from('{"x":1}'), fileName: "c.json" },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.parser).toBe("markdown");
    expect(results[1]!.parser).toBe("text");
    expect(results[2]!.parser).toBe("structured");
  });
});
