---
title: Client IP
description: 客户端 IP 解析，支持代理头的受信读取
---

`getClientIPFromRequest` 从请求头中解析客户端 IP 地址。出于安全考虑，默认不信任代理头，需显式启用。

## 基本用法

```typescript
import { getClientIPFromRequest } from "@ventostack/core";

// 默认不信任代理头，返回 null
const ip = getClientIPFromRequest(request);
```

## 信任代理头

在反向代理（Nginx、Cloudflare 等）后部署时，显式启用：

```typescript
const ip = getClientIPFromRequest(request, { trustProxyHeaders: true });
// 读取 X-Forwarded-For（取第一个 IP）或 X-Real-IP
```

## 在中间件中使用

```typescript
import { getClientIPFromRequest } from "@ventostack/core";

const ipMiddleware: Middleware = async (ctx, next) => {
  ctx.state.clientIP = getClientIPFromRequest(ctx.request, {
    trustProxyHeaders: true,
  });
  return next();
};
```

## IP 解析优先级

当 `trustProxyHeaders: true` 时，按以下顺序解析：

1. `X-Forwarded-For` — 取逗号分隔后的第一个 IP
2. `X-Real-IP` — 直接读取

两者均不存在时返回 `null`。

## 配置选项

### ClientIPOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `trustProxyHeaders` | `boolean` | `false` | 是否信任 `X-Forwarded-For` / `X-Real-IP` |

> ⚠️ 仅在确认上游代理可信时启用 `trustProxyHeaders`，否则客户端可伪造 IP。
