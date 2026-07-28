# @ventostack/integration

VentoStack 的第三方平台签名验证集合，用于在业务边界安全接收支付、协作和电商平台回调。

## 核心能力

- Stripe Webhook 验证
- GitHub Webhook 验证
- DingTalk 与 Slack 请求验证
- Shopify Webhook 验证
- 微信支付回调验证
- 支付宝回调验证

## 使用边界

本包只处理各平台的签名真实性。调用方仍需验证事件类型、时间戳、幂等键、金额、租户和业务资源状态。

```ts
import { createGitHubVerifier } from "@ventostack/integration";

const verifier = createGitHubVerifier();
const result = await verifier.verify(rawBody, headers, {
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});
```
