---
order: 18
title: IP 黑白名单
description: 使用 ipFilter 中间件基于 IP 地址控制访问权限，支持 CIDR 和通配符
---

## 概述

`ipFilter` 中间件支持 IP 白名单和黑名单两种模式，匹配规则支持精确 IP、CIDR 表示法和通配符。未通过检查的请求返回 `403` 响应。

## 基本用法

```typescript
import { ipFilter } from "@ventostack/core";

// 白名单模式：仅允许特定 IP
app.use(
  ipFilter({
    allowlist: ["10.0.0.0/8", "192.168.1.100"],
  }),
);

// 黑名单模式：拒绝特定 IP
app.use(
  ipFilter({
    denylist: ["123.45.67.89", "203.0.113.0/24"],
  }),
);
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `allowlist` | `string[]` | 不限制 | 白名单，只有匹配的 IP 可访问 |
| `denylist` | `string[]` | 不限制 | 黑名单，匹配的 IP 被拒绝 |
| `trustProxyHeaders` | `boolean` | `false` | 是否信任 `X-Forwarded-For` 等代理头 |
| `getIP` | `(req: Request) => string \| null` | 内置方法 | 自定义获取客户端 IP 的函数 |
| `statusCode` | `number` | `403` | 被拒绝时的响应状态码 |

完整类型定义：

```typescript
interface IPFilterOptions {
  allowlist?: string[];
  denylist?: string[];
  trustProxyHeaders?: boolean;
  getIP?: (req: Request) => string | null;
  statusCode?: number;
}

function ipFilter(options?: IPFilterOptions): Middleware;
```

## 匹配规则

- 精确匹配：`"192.168.1.100"`
- CIDR 匹配：`"10.0.0.0/8"`、`"172.16.0.0/12"`
- 通配符匹配：`"192.168.1.*"`（匹配 `192.168.1.0` - `192.168.1.255`）

## 注意事项

- 默认不信任代理头，避免客户端伪造 `X-Forwarded-For` 绕过过滤
- 白名单模式下，无法获取 IP 的请求会被拒绝
- 黑名单优先于白名单检查
- 部署在反向代理后时，需设置 `trustProxyHeaders: true` 或自定义 `getIP`
