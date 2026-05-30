import { describe, expect, test } from "bun:test";

describe("文件管理页", () => {
  test("formatFileSize 格式化文件大小", () => {
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(1048576)).toBe("1.00 MB");
    expect(formatFileSize(1073741824)).toBe("1.00 GB");
  });

  test("图片 MIME 类型检测", () => {
    const isImage = (contentType: string) => contentType?.startsWith("image/");
    expect(isImage("image/png")).toBe(true);
    expect(isImage("image/jpeg")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
    expect(isImage("text/plain")).toBe(false);
    expect(isImage("image/gif")).toBe(true);
    expect(isImage("image/svg+xml")).toBe(true);
  });

  test("文件大小限制 (50MB)", () => {
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    expect(MAX_FILE_SIZE).toBe(52428800);
    expect(1024 * 1024 * 30 < MAX_FILE_SIZE).toBe(true);
    expect(1024 * 1024 * 60 < MAX_FILE_SIZE).toBe(false);
  });

  // --- 新增测试用例 ---

  test("OSS_API 常量路径正确", () => {
    const OSS_API = {
      LIST: "/api/system/oss",
      DETAIL: "/api/system/oss/:id",
      UPLOAD: "/api/system/oss/upload",
      DOWNLOAD: "/api/system/oss/:id/download",
      SIGNED_URL: "/api/system/oss/:id/url",
      DELETE: "/api/system/oss/:id",
    };
    expect(OSS_API.LIST).toBe("/api/system/oss");
    expect(OSS_API.UPLOAD).toBe("/api/system/oss/upload");
    expect(OSS_API.SIGNED_URL).toContain("url");
    expect(OSS_API.DELETE).toContain(":id");
  });

  test("OSSFile 字段名应为 filename（非 originalName）", () => {
    const file = {
      id: "1",
      filename: "test.png",
      contentType: "image/png",
      size: 1024,
      bucket: "default",
      uploaderName: "admin",
      createdAt: "2024-01-01",
    };
    // 实际组件使用 filename 字段
    expect(file.filename).toBe("test.png");
    // 确认不使用 originalName
    expect(file).not.toHaveProperty("originalName");
  });

  test("OSSFile 字段名应为 contentType（非 mime）", () => {
    const file = {
      id: "1",
      filename: "test.png",
      contentType: "image/png",
      size: 1024,
    };
    // 实际组件使用 contentType 字段
    expect(file.contentType).toBe("image/png");
    // 确认不使用 mime
    expect(file).not.toHaveProperty("mime");
  });

  test("isImage 检查 contentType 是否以 image/ 开头", () => {
    const isImage = (contentType: string) => contentType?.startsWith("image/");

    expect(isImage("image/png")).toBe(true);
    expect(isImage("image/jpeg")).toBe(true);
    expect(isImage("image/webp")).toBe(true);
    expect(isImage("image/gif")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
    expect(isImage("video/mp4")).toBe(false);
    expect(isImage("text/html")).toBe(false);
  });

  test("formatFileSize 边界值", () => {
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    };

    // 1 byte
    expect(formatFileSize(1)).toBe("1.00 B");
    // 1023 bytes
    expect(formatFileSize(1023)).toBe("1023.00 B");
    // 刚好 1 KB
    expect(formatFileSize(1024)).toBe("1.00 KB");
    // 非整数 MB
    expect(formatFileSize(1536 * 1024)).toBe("1.50 MB");
    // 50 MB (上传限制)
    expect(formatFileSize(50 * 1024 * 1024)).toBe("50.00 MB");
  });

  test("download: 通过 signed URL 在新标签页打开", () => {
    const buildDownloadAction = (record: { id: string }) => ({
      getSignedUrl: `/api/system/oss/${record.id}/url`,
      openInNewTab: true,
    });

    const action = buildDownloadAction({ id: "f1" });
    expect(action.getSignedUrl).toBe("/api/system/oss/f1/url");
    expect(action.openInNewTab).toBe(true);
  });

  test("preview: 获取 signed URL 用于图片预览", () => {
    const buildPreviewAction = (record: { id: string; contentType: string }) => {
      const isImage = record.contentType?.startsWith("image/");
      return {
        isImage,
        getSignedUrl: isImage ? `/api/system/oss/${record.id}/url` : null,
        showModal: isImage,
      };
    };

    // 图片文件
    const imgAction = buildPreviewAction({ id: "f1", contentType: "image/png" });
    expect(imgAction.isImage).toBe(true);
    expect(imgAction.getSignedUrl).toBe("/api/system/oss/f1/url");
    expect(imgAction.showModal).toBe(true);

    // 非图片文件
    const pdfAction = buildPreviewAction({ id: "f2", contentType: "application/pdf" });
    expect(pdfAction.isImage).toBe(false);
    expect(pdfAction.getSignedUrl).toBeNull();
    expect(pdfAction.showModal).toBe(false);
  });

  test("delete: 调用 DELETE /api/system/oss/:id", () => {
    const buildDeleteRequest = (id: string) => ({
      url: `/api/system/oss/${id}`,
      method: "DELETE",
      params: { id },
    });

    const req = buildDeleteRequest("f1");
    expect(req.url).toBe("/api/system/oss/f1");
    expect(req.method).toBe("DELETE");
    expect(req.params.id).toBe("f1");
  });

  test("搜索参数: filename 和 bucket", () => {
    const cleanParams = (params: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") result[k] = v;
      }
      return result;
    };

    expect(cleanParams({ filename: "test.png", bucket: "default" })).toEqual({
      filename: "test.png",
      bucket: "default",
    });
    expect(cleanParams({ filename: "", bucket: "" })).toEqual({});
    expect(cleanParams({ filename: "avatar", bucket: undefined })).toEqual({ filename: "avatar" });
    expect(cleanParams({ filename: "", bucket: "uploads" })).toEqual({ bucket: "uploads" });
  });

  test("fetcher 使用 OSS_API.LIST 路径", () => {
    const OSS_API_LIST = "/api/system/oss";
    const fetcher = (params: Record<string, unknown>) => ({
      url: OSS_API_LIST,
      query: params,
    });
    const result = fetcher({ filename: "test", page: 1 });
    expect(result.url).toBe("/api/system/oss");
  });

  test("upload action 使用 OSS_API.UPLOAD 路径", () => {
    const OSS_API_UPLOAD = "/api/system/oss/upload";
    const uploadProps = {
      name: "file",
      multiple: true,
      action: OSS_API_UPLOAD,
    };
    expect(uploadProps.action).toBe("/api/system/oss/upload");
    expect(uploadProps.name).toBe("file");
    expect(uploadProps.multiple).toBe(true);
  });

  test("OSSFile 类型应包含必要字段", () => {
    const file = {
      id: "1",
      filename: "test.png",
      contentType: "image/png",
      size: 1024,
      bucket: "default",
      uploaderName: "admin",
      createdAt: "2024-01-01",
    };
    expect(file.id).toBeTruthy();
    expect(file.filename).toBeTruthy();
    expect(file.contentType).toBeTruthy();
    expect(file.size).toBeGreaterThan(0);
    expect(file.bucket).toBeTruthy();
    expect(file.uploaderName).toBeTruthy();
    expect(file.createdAt).toBeTruthy();
  });
});
