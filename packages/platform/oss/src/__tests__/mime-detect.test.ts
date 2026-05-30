/**
 * @ventostack/oss - MIME 检测测试
 */

import { describe, expect, test } from "bun:test";
import { detectMIME, mimeFromExtension } from "../services/mime-detect";

describe("MIME Detection", () => {
  describe("detectMIME (magic bytes)", () => {
    test("PNG 检测", () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBe("image/png");
    });

    test("JPEG 检测", () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBe("image/jpeg");
    });

    test("GIF 检测", () => {
      const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBe("image/gif");
    });

    test("PDF 检测", () => {
      const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBe("application/pdf");
    });

    test("ZIP 检测", () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBe("application/zip");
    });

    test("未知格式返回 null", () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(detectMIME(buf)).toBeNull();
    });

    test("空 buffer 返回 null", () => {
      expect(detectMIME(Buffer.alloc(0))).toBeNull();
    });

    test("过短 buffer 返回 null", () => {
      expect(detectMIME(Buffer.from([0x89, 0x50]))).toBeNull();
    });
  });

  describe("mimeFromExtension", () => {
    test("常见图片扩展名", () => {
      expect(mimeFromExtension(".jpg")).toBe("image/jpeg");
      expect(mimeFromExtension(".png")).toBe("image/png");
      expect(mimeFromExtension(".gif")).toBe("image/gif");
      expect(mimeFromExtension(".webp")).toBe("image/webp");
      expect(mimeFromExtension(".svg")).toBe("image/svg+xml");
    });

    test("文档扩展名", () => {
      expect(mimeFromExtension(".pdf")).toBe("application/pdf");
      expect(mimeFromExtension(".doc")).toBe("application/msword");
      expect(mimeFromExtension(".docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    test("代码文件扩展名", () => {
      expect(mimeFromExtension(".json")).toBe("application/json");
      expect(mimeFromExtension(".html")).toBe("text/html");
      expect(mimeFromExtension(".css")).toBe("text/css");
      expect(mimeFromExtension(".js")).toBe("application/javascript");
    });

    test("未知扩展名返回 null", () => {
      expect(mimeFromExtension(".xyz")).toBeNull();
      expect(mimeFromExtension(".")).toBeNull();
    });

    test("大小写不敏感", () => {
      expect(mimeFromExtension(".JPG")).toBe("image/jpeg");
      expect(mimeFromExtension(".PDF")).toBe("application/pdf");
    });
  });
});
