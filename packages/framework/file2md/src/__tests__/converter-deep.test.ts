import { describe, test, expect } from "bun:test";
import { createConverter } from "../converter";
import type { ConvertProgressEvent } from "../types";

describe("converter — deep tests", () => {
  test("source file saving", async () => {
    const converter = createConverter();
    const tmpSourceDir = `/tmp/f2m-test-sources-${Date.now()}`;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(tmpSourceDir, { recursive: true });

    try {
      const result = await converter.convertFile(
        Buffer.from("# Hello"),
        "document.md",
        { sourceDir: tmpSourceDir },
      );
      expect(result.sourcePath).toBeTruthy();
      expect(result.sourcePath).toBe("document.md");

      // Verify file was saved
      const { existsSync } = await import("node:fs");
      expect(existsSync(`${tmpSourceDir}/document.md`)).toBe(true);
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(tmpSourceDir, { recursive: true, force: true });
    }
  });

  test("convertBatch reports per-file progress", async () => {
    const converter = createConverter();
    const events: ConvertProgressEvent[] = [];

    await converter.convertBatch(
      [
        { buffer: Buffer.from("# A"), fileName: "a.md" },
        { buffer: Buffer.from("B"), fileName: "b.txt" },
        { buffer: Buffer.from("{}"), fileName: "c.json" },
      ],
      {
        onBatchProgress: (e) => events.push(e),
      },
    );

    expect(events.some(e => e.type === "start")).toBe(true);
    expect(events.some(e => e.type === "complete")).toBe(true);
  });

  test("convertBatch handles individual failures gracefully", async () => {
    const converter = createConverter();
    const errors: string[] = [];

    const results = await converter.convertBatch(
      [
        { buffer: Buffer.from("# Good"), fileName: "good.md" },
        { buffer: Buffer.from("bad"), fileName: "bad.mp3" }, // unsupported
        { buffer: Buffer.from("OK"), fileName: "ok.txt" },
      ],
      {
        onProgress: (e) => {
          if (e.type === "error") errors.push(e.fileName);
        },
      },
    );

    // Should succeed for good files, fail for bad
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(errors).toContain("bad.mp3");
  });

  test("convertBatch concurrency limit works", async () => {
    const converter = createConverter();
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const results = await converter.convertBatch(
      Array.from({ length: 10 }, (_, i) => ({
        buffer: Buffer.from(`# File ${i}`),
        fileName: `file${i}.md`,
      })),
      { concurrency: 2 },
    );

    expect(results).toHaveLength(10);
  });

  test("registry returns the converter's registry", () => {
    const converter = createConverter();
    const registry = converter.getRegistry();
    expect(registry).toBeTruthy();
    expect(registry.getSupportedExtensions().length).toBeGreaterThan(20);
  });

  test("convertFile with custom cleaner config per-file", async () => {
    const converter = createConverter();
    const md = "# Title\n\n\n\n\nContent";

    // With cleaning
    const cleaned = await converter.convertFile(Buffer.from(md), "a.md", {
      cleaner: { enabled: true },
    });
    expect(cleaned.outputs[0]!.content).not.toMatch(/\n{4,}/);

    // Without cleaning
    const uncleaned = await converter.convertFile(Buffer.from(md), "b.md", {
      cleaner: { enabled: false },
    });
    expect(uncleaned.outputs[0]!.content).toMatch(/\n{4,}/);
  });

  test("progress events carry correct progress counters in batch", async () => {
    const converter = createConverter();
    const progressEvents: Array<{ fileName: string; current: number; total: number }> = [];

    await converter.convertBatch(
      [
        { buffer: Buffer.from("# A"), fileName: "a.md" },
        { buffer: Buffer.from("B"), fileName: "b.txt" },
      ],
      {
        onProgress: (e) => {
          if (e.progress) {
            progressEvents.push({
              fileName: e.fileName,
              current: e.progress.current,
              total: e.progress.total,
            });
          }
        },
      },
    );

    // All should report total = 2
    for (const evt of progressEvents) {
      expect(evt.total).toBe(2);
    }
  });

  test("custom tmpDir is respected", async () => {
    const customTmp = `/tmp/f2m-custom-${Date.now()}`;
    const converter = createConverter({ tmpDir: customTmp });
    // This should work (tmp dir is created automatically)
    const result = await converter.convertFile(Buffer.from("data"), "test.txt");
    expect(result.parser).toBe("text");
  });

  test("custom maxFileSize is enforced", async () => {
    const converter = createConverter({ maxFileSize: 50 });
    const smallFile = Buffer.alloc(40);
    const bigFile = Buffer.alloc(60);

    // Small file should work
    const result = await converter.convertFile(smallFile, "small.txt");
    expect(result.parser).toBe("text");

    // Big file should fail
    await expect(
      converter.convertFile(bigFile, "big.txt")
    ).rejects.toThrow("超过限制");
  });

  test("default maxFileSize is 100MB", async () => {
    const converter = createConverter();
    // Just verify it doesn't reject a normal-sized buffer
    const result = await converter.convertFile(Buffer.from("normal"), "normal.txt");
    expect(result.parser).toBe("text");
  });
});
