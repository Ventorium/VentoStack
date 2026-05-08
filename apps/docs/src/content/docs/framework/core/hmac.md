---
order: 16
title: HMAC 请求签名
description: 使用 createHMACSigner 对 API 请求进行签名和验证，防止篡改与重放攻击
---

## 概述

`createHMACSigner` 创建 HMAC 签名器，提供请求签名、验证和中间件。签名基于 HTTP 方法、路径、请求体、时间戳和 Nonce 生成，支持防重放攻击（Nonce 去重 + 时间窗口校验）。

## 基本用法

```typescript
import { createHMACSigner } from "@ventostack/core";

const signer = createHMACSigner({
  secret: "your-secret-key-at-least-32-bytes!!",
  algorithm: "SHA-256",
});

// 服务端：注册中间件
app.use(signer.middleware());

// 客户端：生成签名
const { signature, timestamp, nonce } = await signer.sign("POST", "/api/data", '{"key":"value"}');

fetch("/api/data", {
  method: "POST",
  headers: {
    "x-signature": signature,
    "x-timestamp": String(timestamp),
    "x-nonce": nonce,
    "Content-Type": "application/json",
  },
  body: '{"key":"value"}',
});
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `secret` | `string` | **必填** | 签名密钥 |
| `algorithm` | `"SHA-256" \| "SHA-384" \| "SHA-512"` | `"SHA-256"` | 哈希算法 |
| `header` | `string` | `"x-signature"` | 签名请求头名称 |
| `timestampHeader` | `string` | `"x-timestamp"` | 时间戳请求头名称 |
| `nonceHeader` | `string` | `"x-nonce"` | Nonce 请求头名称 |
| `maxAge` | `number` | `300000` | 签名最大有效期（毫秒），默认 5 分钟 |

完整类型定义：

```typescript
interface HMACOptions {
  secret: string;
  algorithm?: "SHA-256" | "SHA-384" | "SHA-512";
  header?: string;
  timestampHeader?: string;
  nonceHeader?: string;
  maxAge?: number;
}

function createHMACSigner(options: HMACOptions): {
  sign(method: string, path: string, body?: string, timestamp?: number, nonce?: string): Promise<{ signature: string; timestamp: number; nonce: string }>;
  verify(request: Request): Promise<{ valid: boolean; reason?: string }>;
  middleware(): Middleware;
};
```

## 注意事项

- 签名消息格式：`{timestamp}\n{nonce}\n{method}\n{path}\n{body}`
- 使用 `timingSafeEqual` 恒定时间比较，防止时序攻击
- 内置 Nonce 去重存储，自动清理过期 Nonce，防止重放攻击
- 验证失败返回 `401`，可选原因为 Missing/Invalid/Expired/Mismatch
