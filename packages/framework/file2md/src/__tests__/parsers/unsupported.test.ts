import { describe, test, expect } from "bun:test";
import { createUnsupportedParser } from "../../parsers/unsupported";
import type { ParseContext } from "../../types";

const ctx: ParseContext = { tmpDir: "/tmp/test" };

describe("unsupported parser", () => {
  const parser = createUnsupportedParser();

  test("canHandle always returns true (兜底)", () => {
    expect(parser.canHandle("anything.xyz")).toBe(true);
    expect(parser.canHandle("file.mp3")).toBe(true);
  });

  test("throws helpful error for audio/video files", async () => {
    const buffer = Buffer.from("fake-audio-data");
    await expect(
      parser.parse({ buffer, fileName: "song.mp3" }, ctx)
    ).rejects.toThrow("音视频文件");
    await expect(
      parser.parse({ buffer, fileName: "video.mp4" }, ctx)
    ).rejects.toThrow("ffmpeg");
  });

  test("throws helpful error for unknown formats", async () => {
    const buffer = Buffer.from("data");
    await expect(
      parser.parse({ buffer, fileName: "file.xyz" }, ctx)
    ).rejects.toThrow("不支持的文件格式");
  });
});
