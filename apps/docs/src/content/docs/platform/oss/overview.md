---
title: 文件存储概述
description: '文件存储模块提供统一的文件上传、下载和管理能力，支持本地存储和 S3 兼容协议的存储适配器。'
---

## 概述

`@ventostack/oss` 的文件存储模块提供统一的文件管理能力，通过存储适配器模式支持本地文件系统和 S3 兼容对象存储（如 AWS S3、MinIO、Cloudflare R2）。

## 存储适配器

### 本地存储 (local)

文件存储在服务器本地文件系统，适用于开发环境和小规模部署：

```typescript
const storage = createLocalStorage({
  rootDir: '/data/uploads',     // 存储根目录
  baseUrl: '/uploads',          // 访问路径前缀
  maxFileSize: 5 * 1024 * 1024, // 5MB
});
```

### S3 存储 (s3)

支持所有 S3 兼容的对象存储服务：

```typescript
const storage = createS3Storage({
  endpoint: 'https://s3.amazonaws.com',   // 或 MinIO/R2 地址
  region: 'us-east-1',
  bucket: 'ventostack-uploads',
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  maxFileSize: 10 * 1024 * 1024,          // 10MB
  pathStyle: false,                        // 虚拟主机风格
});
```

### 适配器接口

```typescript
interface StorageAdapter {
  /** 上传文件 */
  put(key: string, data: Blob | ReadableStream, options?: PutOptions): Promise<StorageResult>;

  /** 获取文件 */
  get(key: string): Promise<StorageObject>;

  /** 删除文件 */
  delete(key: string): Promise<void>;

  /** 获取签名 URL */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  /** 检查文件是否存在 */
  exists(key: string): Promise<boolean>;
}

interface PutOptions {
  contentType?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
}

interface StorageResult {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
}

interface StorageObject {
  key: string;
  size: number;
  contentType: string;
  body: ReadableStream;
  lastModified: Date;
  metadata?: Record<string, string>;
}
```

## 上传接口

### 单文件上传

```typescript
POST /api/system/oss/upload
Content-Type: multipart/form-data

// 文件字段名: file
// 限制: 单文件最大 10MB（可通过 sys.upload.maxSize 配置）
```

上传处理流程：

```typescript
async function handleUpload(ctx: Context) {
  const file = ctx.body.file;

  // 1. 校验文件大小
  const maxSize = await configService.getNumber('sys.upload.maxSize');
  if (file.size > maxSize) {
    throw new ValidationError('file_too_large');
  }

  // 2. 校验文件类型（通过 Magic Number，不仅依赖扩展名）
  const allowedTypes = await configService.getString('sys.upload.allowedTypes');
  const mimeType = await detectMimeType(file.buffer);
  if (!isAllowedType(mimeType, allowedTypes)) {
    throw new ValidationError('file_type_not_allowed');
  }

  // 3. 生成存储 key
  const key = generateStorageKey(file.name, tenantId);
  // 格式: {tenantId}/{year}/{month}/{day}/{uuid}.{ext}

  // 4. 上传到存储
  const result = await storage.put(key, file.buffer, {
    contentType: mimeType,
  });

  // 5. 保存文件记录到数据库
  const record = await db.query`
    INSERT INTO sys_oss (tenant_id, name, key, size, content_type, storage, create_by)
    VALUES (${tenantId}, ${file.name}, ${key}, ${file.size}, ${mimeType}, 's3', ${userId})
    RETURNING *
  `;

  return ctx.json({ data: record[0] });
}
```

### 批量上传

```typescript
POST /api/system/oss/upload-batch
Content-Type: multipart/form-data

// 支持多文件字段: files[]
// 限制: 单次最多 10 个文件
```

## 文件记录管理

所有上传的文件在 `sys_oss` 表中保留记录：

```typescript
// 查询文件列表
GET /api/system/oss?page=1&pageSize=10&name=report&storage=s3

// 响应
{
  "total": 100,
  "rows": [
    {
      "id": "oss-001",
      "name": "report.pdf",
      "key": "tenant-001/2024/06/01/uuid.pdf",
      "size": 1048576,
      "contentType": "application/pdf",
      "storage": "s3",
      "url": "/api/system/oss/oss-001/download",
      "createByName": "张三",
      "createdAt": "2024-06-01T12:00:00Z"
    }
  ]
}
```

### 删除文件

```typescript
DELETE /api/system/oss/{id}

// 同时删除存储文件和数据库记录
// 记录审计日志
```

## 签名 URL

对于 S3 存储，通过签名 URL 实现临时访问授权：

```typescript
GET /api/system/oss/{id}/signed-url?expiresIn=3600

// 响应
{
  "url": "https://s3.amazonaws.com/bucket/key?X-Amz-Signature=...",
  "expiresIn": 3600
}
```

签名 URL 默认有效期 1 小时，最长 24 小时。适用于前端直连下载、第三方预览等场景。

## MIME 校验

文件上传时不依赖客户端提供的 Content-Type，而是通过文件内容的 Magic Number 检测实际类型：

```typescript
async function detectMimeType(buffer: Buffer): Promise<string> {
  // 使用 Bun 内置能力检测
  const type = Bun.file(new Blob([buffer])).type;
  // 或通过文件头字节判断
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)
    return 'application/pdf';
  // ... 更多类型检测
  return 'application/octet-stream';
}
```

危险文件类型黑名单：`exe`、`bat`、`sh`、`cmd`、`com`、`msi`、`scr`、`js`（可执行脚本）、`html`（XSS 风险），这些类型无论配置如何都不允许上传。
