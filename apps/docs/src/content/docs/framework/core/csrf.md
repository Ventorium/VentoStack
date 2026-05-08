---
order: 13
title: CSRF 防护
description: 使用 csrf 中间件防御跨站请求伪造攻击，基于 Double-Submit Cookie 策略
---

## 概述

`csrf` 中间件实现了 CSRF 防护，采用 Double-Submit Cookie 策略。安全方法（GET/HEAD/OPTIONS）自动设置 Token Cookie，非安全方法要求请求头中携带匹配的 Token，否则返回 `403`。

## 基本用法

```typescript
import { csrf } from "@ventostack/core";

app.use(csrf());
```

客户端需在非安全请求中携带 Token：

```javascript
// 从 Cookie 读取 _csrf 值，放入请求头
const token = document.cookie
  .split("; ")
  .find((c) => c.startsWith("_csrf="))
  ?.split("=")[1];

fetch("/api/data", {
  method: "POST",
  headers: { "x-csrf-token": token },
});
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tokenHeader` | `string` | `"x-csrf-token"` | 请求头名称 |
| `cookieName` | `string` | `"_csrf"` | Cookie 名称 |
| `safeMethods` | `string[]` | `["GET", "HEAD", "OPTIONS"]` | 不校验 Token 的 HTTP 方法 |
| `tokenLength` | `number` | `32` | Token 字节长度（生成十六进制字符串） |

完整类型定义：

```typescript
interface CSRFOptions {
  tokenHeader?: string;
  cookieName?: string;
  safeMethods?: string[];
  tokenLength?: number;
}

function csrf(options?: CSRFOptions): Middleware;
```

## 注意事项

- Token 比较使用 `timingSafeEqual` 恒定时间算法，防止时序攻击
- Cookie 设置了 `HttpOnly` 和 `SameSite=Strict` 属性
- Token 在首次安全方法请求时自动生成并写入 Cookie
- 验证失败返回 `403`，错误信息分别为"缺少 CSRF 令牌"或"CSRF 令牌不匹配"
