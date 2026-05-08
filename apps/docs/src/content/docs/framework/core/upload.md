---
order: 15
title: 上传安全校验
description: 使用 createUploadValidator 校验文件上传，限制大小、类型和危险文件名
---

## 概述

`createUploadValidator` 创建文件上传校验器，支持文件大小、数量、MIME 类型、扩展名检查，并自动拦截双扩展名、空字节等常见攻击手法。提供 `sanitizeFilename` 工具函数清理危险文件名。

## 基本用法

```typescript
import { createUploadValidator } from "@ventostack/core";

const validator = createUploadValidator({
  maxFileSize: 2 * 1024 * 1024,  // 2MB
  maxFiles: 5,
  allowedMimeTypes: ["image/png", "image/jpeg"],
  allowedExtensions: ["png", "jpg", "jpeg"],
});

// 在路由中使用
router.post("/upload", async (ctx) => {
  const result = await validator.validate(ctx.request);
  if (!result.valid) {
    return Response.json({ errors: result.errors }, { status: 400 });
  }
  // result.files 包含通过校验的文件信息
});
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxFileSize` | `number` | `5242880`（5MB） | 单个文件最大大小（字节） |
| `maxFiles` | `number` | `10` | 最大文件数量 |
| `allowedMimeTypes` | `string[]` | 不限制 | 允许的 MIME 类型列表 |
| `allowedExtensions` | `string[]` | 不限制 | 允许的扩展名列表 |
| `rejectDoubleExtensions` | `boolean` | `true` | 是否拒绝双扩展名文件 |
| `rejectNullBytes` | `boolean` | `true` | 是否拒绝含空字节的文件名 |

完整类型定义：

```typescript
interface UploadOptions {
  maxFileSize?: number;
  maxFiles?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  rejectDoubleExtensions?: boolean;
  rejectNullBytes?: boolean;
}

function createUploadValidator(options?: UploadOptions): {
  validate(request: Request): Promise<UploadResult>;
  sanitizeFilename(name: string): string;
};
```

## 注意事项

- `sanitizeFilename` 会移除路径分隔符、控制字符和空字节，仅保留字母数字和 `.-_`
- 默认拦截的危险扩展名包括 `php`、`exe`、`sh`、`jsp`、`asp` 等
- 双扩展名检查可防止 `image.php.jpg` 类型的绕过攻击
- 隐藏文件（以 `.` 开头）会被自动重命名，前缀改为 `_`
