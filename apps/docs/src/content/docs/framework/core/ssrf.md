---
order: 14
title: SSRF 防护
description: 使用 createSSRFGuard 防止服务端请求伪造，校验出站 URL 的安全性
---

## 概述

`createSSRFGuard` 创建一个 SSRF 防护守卫对象，提供 `validateURL` 和 `safeFetch` 两个方法。默认阻塞所有私有地址（127.0.0.0/8、10.0.0.0/8、192.168.0.0/16 等），并通过 DNS 解析防止域名指向内部 IP 的绕过攻击。

## 基本用法

```typescript
import { createSSRFGuard } from "@ventostack/core";

const guard = createSSRFGuard();

// 校验 URL
const result = guard.validateURL("https://example.com");
// { safe: true }

const blocked = guard.validateURL("http://127.0.0.1/admin");
// { safe: false, reason: "Blocked IP: 127.0.0.1" }

// 安全 fetch
const response = await guard.safeFetch("https://api.example.com/data");
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `allowedHosts` | `string[]` | `[]` | 允许的域名白名单，跳过所有检查 |
| `blockedCIDRs` | `string[]` | `[]` | 额外阻塞的 CIDR 范围 |
| `allowPrivate` | `boolean` | `false` | 是否允许访问私有地址 |

完整类型定义：

```typescript
interface SSRFOptions {
  allowedHosts?: string[];
  blockedCIDRs?: string[];
  allowPrivate?: boolean;
}

function createSSRFGuard(options?: SSRFOptions): {
  validateURL(url: string): { safe: boolean; reason?: string };
  safeFetch(url: string, init?: RequestInit): Promise<Response>;
};
```

## 默认阻塞的地址范围

- IPv4：`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`、`0.0.0.0/8`
- IPv6：`::1/128`、`fc00::/7`、`fe80::/10`
- 主机名：`localhost` 及 `*.localhost`

## 注意事项

- `safeFetch` 会通过 DNS 解析验证域名是否指向阻塞 IP，比 `validateURL` 更严格
- 仅允许 `http:` 和 `https:` 协议
- `allowedHosts` 中的域名直接放行，不做 IP 检查
- 生产环境建议保持 `allowPrivate: false`
