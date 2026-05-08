---
title: Static Files
description: 静态文件服务中间件，内置路径遍历防护
---

`createStaticMiddleware` 提供安全的本地文件服务，内置路径遍历防护，Content-Type 由 `Bun.file` 自动推断。

## 基本用法

```typescript
import { createStaticMiddleware } from "@ventostack/core";

app.use(createStaticMiddleware({
  root: "/data/uploads",
  prefix: "/uploads",
}));
```

访问 `/uploads/photo.jpg` 将返回 `/data/uploads/photo.jpg`。

## 默认索引文件

```typescript
app.use(createStaticMiddleware({
  root: "./public",
  prefix: "/",
  index: "index.html",
}));
```

## 扩展名白名单

限制可访问的文件类型：

```typescript
app.use(createStaticMiddleware({
  root: "./assets",
  prefix: "/assets",
  allowedExtensions: [".jpg", ".png", ".svg", ".css", ".js"],
}));
```

不在白名单中的文件返回 `403`。

## 安全特性

- **路径遍历防护**：过滤 `..`、`.` 和多余斜杠
- **根目录校验**：拼接后的路径不逃逸根目录
- **扩展名白名单**：可选，限制可访问文件类型
- **文件存在检查**：不存在时交由下一个中间件处理

## 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `root` | `string` | — | 文件系统根目录（必填） |
| `prefix` | `string` | `"/"` | URL 路径前缀 |
| `index` | `string` | — | 默认索引文件名（如 `"index.html"`） |
| `allowedExtensions` | `string[]` | — | 允许的文件扩展名白名单 |
