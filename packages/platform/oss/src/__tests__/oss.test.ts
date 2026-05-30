/**
 * @ventostack/oss - OSS 服务测试
 */

import { describe, expect, test } from "bun:test";
import { createOSSService } from "../services/oss";
import { createMockDatabase, createMockExecutor, createMockStorage } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db } = createMockDatabase(mockExec);
  const storage = createMockStorage();
  const ossService = createOSSService({ db, storage });
  return {
    ossService,
    executor: mockExec.executor,
    calls: mockExec.calls,
    results: mockExec.results,
    storage,
    db,
  };
}

describe("OSS Service", () => {
  describe("upload", () => {
    test("上传文件创建记录并写入存储", async () => {
      const s = setup();
      const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

      const result = await s.ossService.upload(
        {
          filename: "test.png",
          data,
          bucket: "default",
        },
        "user-1",
      );

      expect(result.id).toBeTruthy();
      expect(result.originalName).toBe("test.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.extension).toBe(".png");
      expect(result.bucket).toBe("default");
      expect(result.uploaderId).toBe("user-1");
      expect(result.size).toBe(12);

      // Storage should have been called
      expect(s.storage.write).toHaveBeenCalled();

      // SQL INSERT should have been called
      const insertCall = s.calls.find((c) => c.text.includes("INSERT"));
      expect(insertCall).toBeTruthy();
    });

    test("使用指定 contentType 而非 magic byte 检测", async () => {
      const s = setup();
      const data = Buffer.from("hello");

      const result = await s.ossService.upload(
        {
          filename: "test.txt",
          data,
          contentType: "text/plain",
        },
        "user-1",
      );

      expect(result.mimeType).toBe("text/plain");
    });

    test("无扩展名文件 fallback 到 magic byte 检测", async () => {
      const s = setup();
      const data = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0]);

      const result = await s.ossService.upload(
        {
          filename: "document",
          data,
        },
        "user-1",
      );

      expect(result.mimeType).toBe("application/pdf");
      expect(result.extension).toBeNull();
    });
  });

  describe("download", () => {
    test("下载已有文件返回 stream", async () => {
      const s = setup();
      const data = Buffer.from("file content");

      // First upload
      const uploaded = await s.ossService.upload(
        {
          filename: "test.txt",
          data,
          contentType: "text/plain",
        },
        "user-1",
      );

      // Mock DB result
      s.results.set("SELECT", [
        {
          id: uploaded.id,
          original_name: "test.txt",
          storage_path: uploaded.storagePath,
          mime_type: "text/plain",
        },
      ]);

      const result = await s.ossService.download(uploaded.id);
      expect(result).toBeTruthy();
      expect(result!.contentType).toBe("text/plain");
      expect(result!.filename).toBe("test.txt");
    });

    test("下载不存在的文件返回 null", async () => {
      const s = setup();
      // No DB result
      const result = await s.ossService.download("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    test("删除文件同时清理存储和数据库", async () => {
      const s = setup();
      const data = Buffer.from("to delete");

      const uploaded = await s.ossService.upload(
        {
          filename: "delete-me.txt",
          data,
        },
        "user-1",
      );

      // Mock DB result for delete lookup
      s.results.set("SELECT", [
        {
          storage_path: uploaded.storagePath,
        },
      ]);

      await s.ossService.delete(uploaded.id);

      // Storage delete should have been called
      expect(s.storage.delete).toHaveBeenCalled();

      // SQL DELETE should have been called
      const deleteCall = s.calls.find((c) => c.text.includes("DELETE"));
      expect(deleteCall).toBeTruthy();
    });

    test("删除不存在的文件不抛异常", async () => {
      const s = setup();
      // No DB result
      await s.ossService.delete("nonexistent");
      // Should not throw
    });
  });

  describe("getSignedUrl", () => {
    test("返回签名 URL", async () => {
      const s = setup();
      s.results.set("SELECT", [{ storage_path: "default/20240101/test.png" }]);

      const url = await s.ossService.getSignedUrl("file-1", 7200);
      expect(url).toBeTruthy();
      expect(url).toContain("files/");
    });

    test("文件不存在返回 null", async () => {
      const s = setup();
      const url = await s.ossService.getSignedUrl("nonexistent");
      expect(url).toBeNull();
    });
  });

  describe("list", () => {
    test("分页查询文件列表", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 2 }]);
      s.results.set("SELECT", [
        {
          id: "f1",
          original_name: "a.png",
          storage_path: "p1",
          size: 100,
          mime_type: "image/png",
          extension: ".png",
          bucket: "default",
          uploader_id: "u1",
          created_at: "2024-01-01",
        },
        {
          id: "f2",
          original_name: "b.jpg",
          storage_path: "p2",
          size: 200,
          mime_type: "image/jpeg",
          extension: ".jpg",
          bucket: "default",
          uploader_id: "u1",
          created_at: "2024-01-02",
        },
      ]);

      const result = await s.ossService.list({ page: 1, pageSize: 10 });
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
    });

    test("按 bucket 筛选", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 0 }]);

      await s.ossService.list({ bucket: "avatars" });
      const countCall = s.calls.find((c) => c.text.includes("COUNT"));
      expect(countCall?.params).toContain("avatars");
    });
  });
});
