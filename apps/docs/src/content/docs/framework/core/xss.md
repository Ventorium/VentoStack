---
order: 17
title: XSS 防护
description: 使用 xssProtection 中间件设置安全响应头，并提供 HTML 转义和 XSS 检测工具
---

## 概述

`xssProtection` 中间件自动为响应添加 XSS 防护相关的安全头（`X-XSS-Protection`、`X-Content-Type-Options`、`Content-Security-Policy`、`X-Frame-Options`）。同时提供 `escapeHTML` 和 `detectXSS` 工具函数用于手动防护。

## 基本用法

```typescript
import { xssProtection } from "@ventostack/core";

// 默认配置
app.use(xssProtection());

// 自定义 CSP
app.use(
  xssProtection({
    contentSecurityPolicy: "default-src 'self'; script-src 'self'",
    frameOptions: "SAMEORIGIN",
  }),
);
```

## 工具函数

```typescript
import { escapeHTML, detectXSS } from "@ventostack/core";

// HTML 实体转义
escapeHTML('<script>alert("xss")</script>');
// => "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"

// XSS 载荷检测
detectXSS('<script>alert(1)</script>'); // true
detectXSS('Hello World');               // false
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `xssProtection` | `boolean` | `true` | 是否设置 `X-XSS-Protection: 1; mode=block` |
| `noSniff` | `boolean` | `true` | 是否设置 `X-Content-Type-Options: nosniff` |
| `contentSecurityPolicy` | `string` | 不设置 | CSP 策略值 |
| `frameOptions` | `"DENY" \| "SAMEORIGIN"` | `"DENY"` | `X-Frame-Options` 值 |

完整类型定义：

```typescript
interface XSSOptions {
  xssProtection?: boolean;
  noSniff?: boolean;
  contentSecurityPolicy?: string;
  frameOptions?: "DENY" | "SAMEORIGIN";
}

function xssProtection(options?: XSSOptions): Middleware;
function escapeHTML(input: string): string;
function detectXSS(input: string): boolean;
```

## 注意事项

- `escapeHTML` 优先使用 `Bun.escapeHTML()`，不可用时回退到手动替换
- `detectXSS` 通过正则匹配常见 XSS 模式（`<script>`、`javascript:`、事件处理器等）
- 中间件仅添加安全头，不拦截请求；配合 `escapeHTML` 做输出转义效果更佳
