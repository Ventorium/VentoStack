import { describe, expect, test } from "bun:test";
import { renderTextPng } from "../../ocr/test";
import { testOcrService } from "../../ocr/test";

describe("testOcrService", () => {
  test("缺少服务地址时直接返回失败", async () => {
    const result = await testOcrService({ serverUrl: "" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("服务地址");
  });

  test("renderTextPng 生成合法 PNG（尺寸与魔数正确）", () => {
    const png = renderTextPng("TEST");
    // PNG 魔数
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR：宽 (4*(5+2)-2)*4 = 104，高 7*4 = 28
    expect(png.readUInt32BE(16)).toBe(104);
    expect(png.readUInt32BE(20)).toBe(28);
    // 8 位灰度
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(0);
  });
});
