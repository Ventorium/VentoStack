/**
 * @ventostack/oss - MIME 检测测试
 */

import { describe, expect, test } from "bun:test";
import { assertSafeUpload, detectMIME, mimeFromExtension } from "../services/mime-detect";

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
    });

    test("文档扩展名", () => {
      expect(mimeFromExtension(".pdf")).toBe("application/pdf");
      expect(mimeFromExtension(".doc")).toBe("application/msword");
      expect(mimeFromExtension(".docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    test("可执行/可嵌入脚本类型不映射（安全白名单移除）", () => {
      // 安全策略：html/svg/xml/js/css 等可执行或可嵌入脚本的类型不允许上传
      expect(mimeFromExtension(".svg")).toBeNull();
      expect(mimeFromExtension(".html")).toBeNull();
      expect(mimeFromExtension(".css")).toBeNull();
      expect(mimeFromExtension(".js")).toBeNull();
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

  describe("assertSafeUpload", () => {
    test("允许白名单扩展名且 magic bytes 匹配", () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      expect(assertSafeUpload("a.png", png)).toBe("image/png");
    });

    test("拒绝可执行类型（html/svg）", () => {
      const data = Buffer.from("<script>alert(1)</script>");
      expect(() => assertSafeUpload("a.html", data)).toThrow("不允许的文件类型");
      expect(() => assertSafeUpload("a.svg", data)).toThrow("不允许的文件类型");
      expect(() => assertSafeUpload("a.js", data)).toThrow("不允许的文件类型");
    });

    test("拒绝无扩展名文件", () => {
      const data = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]);
      expect(() => assertSafeUpload("document", data)).toThrow("不允许的文件类型");
    });

    test("拒绝内容与扩展名不匹配的文件", () => {
      // 扩展名是 png 但内容是文本
      const data = Buffer.from("not really a png");
      expect(() => assertSafeUpload("a.png", data)).toThrow("文件内容与扩展名不匹配");
    });

    test("拒绝伪装成图片的 HTML", () => {
      const data = Buffer.from("<script>alert(1)</script>");
      expect(() => assertSafeUpload("evil.png", data)).toThrow("文件内容与扩展名不匹配");
    });
  });
});
