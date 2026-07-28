# @ventostack/webhook

VentoStack 的 Webhook 安全收发基础设施，统一处理签名、重放防护、投递和重试。

## 核心能力

- HMAC 签名及常量时间比较
- RSA-SHA256 签名验证
- 通用入站 HMAC 验证器
- 时间戳和签名校验
- 出站 Webhook 管理
- 指数退避和投递状态管理

## 使用边界

Webhook 密钥必须从安全配置注入。业务模块仍需对通过签名验证的载荷执行 Schema 校验和权限判断。

```ts
import { createGenericHmacVerifier } from "@ventostack/webhook";

const verifier = createGenericHmacVerifier("sha256", "x-signature");
const result = await verifier.verify(rawBody, headers, {
  secret: process.env.WEBHOOK_SECRET!,
});
```
