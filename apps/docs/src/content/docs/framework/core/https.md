---
order: 19
title: HTTPS 强制与 HSTS
description: 使用 httpsEnforce 中间件强制 HTTPS 连接并设置 HSTS 安全头
---

## 概述

`httpsEnforce` 中间件自动将 HTTP 请求 301 重定向到 HTTPS，并为 HTTPS 响应附加 `Strict-Transport-Security` (HSTS) 头，防止协议降级攻击。

## 基本用法

```typescript
import { httpsEnforce } from "@ventostack/core";

app.use(httpsEnforce());
```

默认行为：
- HTTP 请求 → 301 重定向到 HTTPS
- HTTPS 响应 → 附加 `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `hsts` | `boolean` | `true` | 是否启用 HSTS 头 |
| `maxAge` | `number` | `31536000` | HSTS max-age（秒），默认 1 年 |
| `includeSubDomains` | `boolean` | `true` | HSTS 是否包含子域 |
| `preload` | `boolean` | `false` | 是否添加 preload 标记 |
| `proxyHeader` | `string` | `"x-forwarded-proto"` | 用于判断协议的代理头 |
| `excludePaths` | `string[]` | `[]` | 排除的路径（如健康检查） |

完整类型定义：

```typescript
interface HTTPSOptions {
  hsts?: boolean;
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
  proxyHeader?: string;
  excludePaths?: string[];
}

function httpsEnforce(options?: HTTPSOptions): Middleware;
```

## 排除特定路径

健康检查等路径可以跳过 HTTPS 强制：

```typescript
app.use(
  httpsEnforce({
    excludePaths: ["/health", "/ready"],
  }),
);
```

## 注意事项

- 通过 `proxyHeader`（默认 `x-forwarded-proto`）判断是否为 HTTPS，部署在反向代理后时需确保代理正确设置此头
- HSTS 的 `preload` 需要配合域名提交到浏览器 HSTS Preload List 才能生效
- 排除路径使用精确匹配
