---
title: 第三方集成
description: 常见第三方平台的 Webhook 入站签名验证器集合
---

# 第三方集成

`@ventostack/integration` 提供常见第三方平台的 Webhook 入站签名验证器，每个验证器实现 `@ventostack/webhook` 的 `WebhookProviderVerifier` 接口，可直接与入站验证器配合使用。

## 支持的平台

| 平台 | 导出函数 | 签名算法 | 签名头 |
|------|----------|----------|--------|
| Stripe | `createStripeVerifier()` | HMAC-SHA256 | `Stripe-Signature` |
| GitHub | `createGitHubVerifier()` | HMAC-SHA256 | `X-Hub-Signature-256` |
| 钉钉 | `createDingTalkVerifier()` | HMAC-SHA256 + Base64 | URL query params |
| Slack | `createSlackVerifier()` | HMAC-SHA256 | `X-Slack-Signature` |
| Shopify | `createShopifyVerifier()` | HMAC-SHA256 (Base64) | `X-Shopify-Hmac-SHA256` |
| 微信支付 | `createWeChatPayVerifier()` | RSA-SHA256 | `Wechatpay-Signature` |
| 支付宝 | `createAlipayVerifier()` | RSA2 (SHA256WithRSA) | body params |

## 与 Webhook 模块配合使用

所有验证器均返回 `WebhookProviderVerifier`，可直接传入 `createInboundVerifier`：

```ts
import { createInboundVerifier } from "@ventostack/webhook";
import { createStripeVerifier } from "@ventostack/integration";

const stripeVerifier = createInboundVerifier({
  provider: createStripeVerifier(),
  config: { secret: "whsec_xxx" },
});

// 在路由中使用
const event = await stripeVerifier.verifyAndConvert(rawBody, headers);
// event.type → "webhook.received"
// event.source → "stripe"
// event.payload → 解析后的 JSON
```

## 各平台详细说明

### Stripe

验证 `Stripe-Signature` 头，格式为 `t=<timestamp>,v1=<signature>`。签名内容为 `timestamp + "." + rawBody`。

- 默认 5 分钟时间容差
- 支持密钥轮换（多个 `v1` 签名匹配其一即通过）

```ts
const verifier = createStripeVerifier();
// config.secret: Stripe Webhook Signing Secret
```

### GitHub

验证 `X-Hub-Signature-256` 头，格式为 `sha256=<hex>`。签名内容为原始 body。

- 无时间戳/重放保护
- 事件类型通过 `X-GitHub-Event` 头提取，返回 `github.<event>` 格式

```ts
const verifier = createGitHubVerifier();
// config.secret: GitHub Webhook Secret
```

### 钉钉（DingTalk）

签名通过 URL query params 传递（`timestamp` + `sign`）。签名内容为 `timestamp + "\n" + secret`，算法为 `HmacSHA256 → Base64 → URL encode`。

- 默认 1 小时时间容差
- 需通过 `config.extra` 传入 `timestamp` 和 `sign`

```ts
const verifier = createDingTalkVerifier();
// config.extra = { timestamp: "xxx", sign: "xxx" }
```

### Slack

验证 `X-Slack-Signature` 头，格式为 `v0=<hex>`。签名内容为 `"v0:" + timestamp + ":" + rawBody`，时间戳在 `X-Slack-Request-Timestamp` 头中。

- 默认 5 分钟时间容差

```ts
const verifier = createSlackVerifier();
// config.secret: Slack Signing Secret
```

### Shopify

验证 `X-Shopify-Hmac-SHA256` 头。签名内容为原始 body，编码为 **Base64**（非 hex）。

- 无时间戳/重放保护
- 事件类型通过 `X-Shopify-Topic` 头提取

```ts
const verifier = createShopifyVerifier();
// config.secret: Shopify App Secret
```

### 微信支付（WeChat Pay）

验证 `Wechatpay-Signature` 头中的 RSA-SHA256 签名。待签名为 `timestamp + "\n" + nonce + "\n" + body + "\n"`。

- 需要微信支付平台证书公钥（PEM 格式）
- 支持多证书：通过 `Wechatpay-Serial` 头匹配 `config.extra.certificates` 映射

```ts
const verifier = createWeChatPayVerifier();
// config.publicKey: PEM 格式公钥
// config.extra.certificates: { [serial]: pemPublicKey } 可选的多证书映射
```

### 支付宝（Alipay）

签名在请求体参数中（`sign` + `sign_type`）。待签名为排除 `sign`、`sign_type` 和空值后，按 key 字典排序的 `key=value&...` 字符串。

- 算法为 RSA2（SHA256WithRSA）
- 需通过 `config.extra.bodyParams` 传入解析后的参数

```ts
const verifier = createAlipayVerifier();
// config.publicKey: 支付宝公钥（PEM 格式）
// config.extra.bodyParams: { sign, notify_type, trade_no, ... }
```
