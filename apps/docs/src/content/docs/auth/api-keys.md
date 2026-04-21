---
title: API 密钥管理
description: 使用 createAPIKeyManager 为应用添加 API 密钥认证
---

`createAPIKeyManager` 提供了 API 密钥的生成、验证和管理功能，适合为第三方开发者提供 API 访问。

## 基本用法

```typescript
import { createAPIKeyManager } from "@aeron/auth";

const apiKeys = createAPIKeyManager({
  prefix: "ak",              // 密钥前缀：ak_xxxx
  hashAlgorithm: "sha256",  // 存储时哈希
});
```

## 生成 API 密钥

```typescript
router.post("/api-keys", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;
  const { name, scopes } = await ctx.body<{ name: string; scopes: string[] }>();

  const { key, hash } = await apiKeys.generate();

  // 只存储哈希值，不存储原始密钥
  await db.insert("api_keys", {
    user_id: userId,
    name,
    key_hash: hash,
    scopes: JSON.stringify(scopes),
    created_at: new Date(),
  }).execute();

  // 只在创建时返回一次原始密钥
  return ctx.json({ key, name, scopes }, 201);
});
```

## 验证 API 密钥

```typescript
const apiKeyAuth: Middleware = async (ctx, next) => {
  const key = ctx.headers.get("x-api-key");
  if (!key) {
    throw new UnauthorizedError("缺少 API 密钥");
  }

  const hash = apiKeys.hash(key);
  const apiKey = await db.from("api_keys")
    .where("key_hash", "=", hash)
    .where("revoked", "=", false)
    .first();

  if (!apiKey) {
    throw new UnauthorizedError("API 密钥无效");
  }

  // 更新最后使用时间
  await db.update("api_keys")
    .set({ last_used_at: new Date() })
    .where("id", "=", apiKey.id)
    .execute();

  ctx.state.apiKey = apiKey;
  ctx.state.userId = apiKey.user_id;
  await next();
};
```

## 撤销 API 密钥

```typescript
router.delete("/api-keys/:id", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;

  await db.update("api_keys")
    .set({ revoked: true, revoked_at: new Date() })
    .where("id", "=", ctx.params.id)
    .where("user_id", "=", userId)  // 只能撤销自己的密钥
    .execute();

  return ctx.json({ ok: true });
});
```

## APIKeyManager 接口

```typescript
interface APIKeyManager {
  generate(): Promise<{ key: string; hash: string }>;
  hash(key: string): string;
  verify(key: string, hash: string): boolean;
}
```
