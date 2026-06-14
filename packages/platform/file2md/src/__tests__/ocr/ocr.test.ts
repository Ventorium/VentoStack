import { describe, test, expect, mock } from "bun:test";
import { createRemoteOCRService } from "../../ocr/remote";

describe("remote OCR service", () => {
  test("creates service with correct name", () => {
    const service = createRemoteOCRService({
      serverUrl: "http://localhost:8866/ocr",
    });
    expect(service.name).toContain("remote-ocr");
  });

  test("throws on non-OK response", async () => {
    // Mock fetch to return error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("error", { status: 500 });

    const service = createRemoteOCRService({
      serverUrl: "http://localhost:8866/ocr",
    });

    await expect(
      service.recognize(Buffer.from("fake-image"))
    ).rejects.toThrow("500");

    globalThis.fetch = originalFetch;
  });

  test("parses PaddleOCR response format", async () => {
    const originalFetch = globalThis.fetch;
    const paddleResponse = [
      [
        [[[10, 10], [100, 10], [100, 30], [10, 30]], ["Hello", 0.95]],
        [[[10, 40], [100, 40], [100, 60], [10, 60]], ["World", 0.88]],
      ]
    ];

    globalThis.fetch = async () => new Response(JSON.stringify(paddleResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const service = createRemoteOCRService({
      serverUrl: "http://localhost:8866/ocr",
    });

    const result = await service.recognize(Buffer.from("fake-image"));
    expect(result.text).toBe("Hello\nWorld");
    expect(result.confidence).toBeCloseTo(0.915);
    expect(result.blocks).toHaveLength(2);

    globalThis.fetch = originalFetch;
  });
});
