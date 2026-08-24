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
        "tenant-1",
      );

      expect(result.id).toBeTruthy();
      expect(result.originalName).toBe("test.png");
      expect(result.mimeType).toBe("image/png");
      expect(result.extension).toBe(".png");
      expect(result.bucket).toBe("default");
      expect(result.tenantId).toBe("tenant-1");
      expect(result.uploaderId).toBe("user-1");
      expect(result.size).toBe(12);

      // Storage should have been called
      expect(s.storage.write).toHaveBeenCalled();

      // SQL INSERT should have been called
      const insertCall = s.calls.find((c) => c.text.includes("INSERT"));
      expect(insertCall).toBeTruthy();

      // INSERT 应携带租户 ID
      expect(insertCall?.text).toContain("tenant_id");
      expect(insertCall?.params).toContain("tenant-1");
    });

    test("存储路径包含租户段", async () => {
      const s = setup();
      const data = Buffer.from("hello");

      const result = await s.ossService.upload(
        { filename: "test.txt", data, contentType: "text/plain" },
        "user-1",
        "tenant-1",
      );

      expect(result.storagePath).toMatch(/^default\/tenant-1\/\d{8}\//);
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
        "default",
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
        "default",
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
        "tenant-1",
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

      const result = await s.ossService.download(uploaded.id, "tenant-1");
      expect(result).toBeTruthy();
      expect(result!.contentType).toBe("text/plain");
      expect(result!.filename).toBe("test.txt");

      // 查询条件必须包含租户过滤
      const selectCall = s.calls.filter((c) => c.text.includes("SELECT")).pop()!;
      expect(selectCall.text).toContain("tenant_id");
      expect(selectCall.params).toContain("tenant-1");
    });

    test("下载不存在的文件返回 null", async () => {
      const s = setup();
      // No DB result
      const result = await s.ossService.download("nonexistent", "tenant-1");
      expect(result).toBeNull();
    });

    test("跨租户下载被拒绝（查询按租户过滤，返回 null）", async () => {
      const s = setup();
      // 模拟 DB 按租户过滤后查不到记录（文件属于 tenant-2，请求来自 tenant-1）
      s.results.set("SELECT", []);

      const result = await s.ossService.download("file-of-tenant-2", "tenant-1");
      expect(result).toBeNull();

      // 查询必须带请求方租户参数而非文件归属租户
      const selectCall = s.calls.filter((c) => c.text.includes("SELECT")).pop()!;
      expect(selectCall.text).toContain("tenant_id = $");
      expect(selectCall.params).not.toContain("tenant-2");
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
        "tenant-1",
      );

      // Mock DB result for delete lookup
      s.results.set("SELECT", [
        {
          storage_path: uploaded.storagePath,
        },
      ]);

      await s.ossService.delete(uploaded.id, "tenant-1");

      // Storage delete should have been called
      expect(s.storage.delete).toHaveBeenCalled();

      // SQL DELETE should have been called
      const deleteCall = s.calls.find((c) => c.text.includes("DELETE"));
      expect(deleteCall).toBeTruthy();
      expect(deleteCall?.params).toContain("tenant-1");
    });

    test("删除不存在的文件不抛异常", async () => {
      const s = setup();
      // No DB result
      await s.ossService.delete("nonexistent", "tenant-1");
      // Should not throw
    });

    test("跨租户删除被拒绝：不触发存储删除与数据库删除", async () => {
      const s = setup();
      // 模拟 DB 按租户过滤后查不到记录（文件属于 tenant-2，请求来自 tenant-1）
      s.results.set("SELECT", []);

      await s.ossService.delete("file-of-tenant-2", "tenant-1");

      // 不应触碰存储与数据库删除
      expect(s.storage.delete).not.toHaveBeenCalled();
      expect(s.calls.find((c) => c.text.includes("DELETE"))).toBeUndefined();

      // 查询必须带请求方租户参数而非文件归属租户
      const selectCall = s.calls.find((c) => c.text.includes("SELECT"))!;
      expect(selectCall.text).toContain("tenant_id = $");
      expect(selectCall.params).not.toContain("tenant-2");
    });
  });

  describe("getSignedUrl", () => {
    test("返回签名 URL", async () => {
      const s = setup();
      s.results.set("SELECT", [{ storage_path: "default/20240101/test.png" }]);

      const url = await s.ossService.getSignedUrl("file-1", "default", 7200);
      expect(url).toBeTruthy();
      expect(url).toContain("files/");
    });

    test("文件不存在返回 null", async () => {
      const s = setup();
      const url = await s.ossService.getSignedUrl("nonexistent", "default");
      expect(url).toBeNull();
    });

    test("跨租户签名 URL 被拒绝", async () => {
      const s = setup();
      // 模拟 DB 按租户过滤后查不到记录（文件属于 tenant-2，请求来自 tenant-1）
      s.results.set("SELECT", []);

      const url = await s.ossService.getSignedUrl("file-of-tenant-2", "tenant-1");
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
          tenant_id: "tenant-1",
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
          tenant_id: "tenant-1",
          uploader_id: "u1",
          created_at: "2024-01-02",
        },
      ]);

      const result = await s.ossService.list({ tenantId: "tenant-1", page: 1, pageSize: 10 });
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.items[0]!.tenantId).toBe("tenant-1");
    });

    test("强制按 tenantId 过滤（无条件注入）", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 0 }]);

      await s.ossService.list({ tenantId: "tenant-1" });
      const countCall = s.calls.find((c) => c.text.includes("COUNT"))!;
      expect(countCall.text).toContain("tenant_id = $");
      expect(countCall.params![0]).toBe("tenant-1");
    });

    test("bucket/uploaderId 仅作为租户内附加筛选", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 0 }]);

      await s.ossService.list({
        tenantId: "tenant-1",
        bucket: "avatars",
        uploaderId: "u1",
      });
      const countCall = s.calls.find((c) => c.text.includes("COUNT"))!;
      // 租户条件在最前且必然存在
      expect(countCall.params![0]).toBe("tenant-1");
      // 附加筛选仍生效
      expect(countCall.params).toContain("avatars");
      expect(countCall.params).toContain("u1");
      // 条件以 AND 连接
      expect((countCall.text.match(/AND/g) ?? []).length).toBe(2);
    });

    test("客户端无法通过查询参数绕过租户隔离", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 0 }]);
      s.results.set("SELECT", []);

      // 客户端只传 bucket/uploaderId，租户始终由服务端注入
      await s.ossService.list({ tenantId: "tenant-1", uploaderId: "u-other" });
      const countCalls = s.calls.filter((c) => c.text.includes("COUNT"));
      for (const call of countCalls) {
        expect(call.params![0]).toBe("tenant-1");
        expect(call.params).not.toContain("tenant-2");
      }
    });
  });
});
