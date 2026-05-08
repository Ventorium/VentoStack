---
order: 3
title: API 密钥管理
description: 使用 createApiKeyManager 为应用添加 API 密钥认证
---

`createApiKeyManager` 提供了 API 密钥的生成、哈希与恒定时间校验能力，适合为第三方开发者提供 API 访问。API Key 必须哈希后存储，不允许明文持久化；校验使用恒定时间比较防止时序攻击。

## 基本用法

```typescript
import { createApiKeyManager } from "@ventostack/auth";

// 创建 API Key 管理器（无需参数）
const apiKeys = createApiKeyManager();
```

## 生成 API 密钥

```typescript
const ApiKeyModel = defineModel("api_keys", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  userId: column.bigint(),
  name: column.varchar({ length: 255 }),
  keyHash: column.varchar({ length: 255 }),
  scopes: column.json<string[]>(),
  revoked: column.boolean({ default: false }),
  createdAt: column.timestamp(),
  lastUsedAt: column.timestamp({ nullable: true }),
  revokedAt: column.timestamp({ nullable: true }),
});

router.post("/api-keys", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;
  const { name, scopes } = await ctx.request.json() as { name: string; scopes: string[] };

  const { key, hash } = await apiKeys.generate({ tenantId: userId });
  // key: "ak_a1b2c3d4_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (明文，仅返回一次)
  // hash: "a1b2c3d4..." (SHA-256 哈希，用于持久化存储)

  // 只存储哈希值，不存储原始密钥
  await db.query(ApiKeyModel).insert({
    userId,
    name,
    keyHash: hash,
    scopes,
    revoked: false,
    createdAt: new Date(),
  });

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

  // hash() 是异步方法
  const hash = await apiKeys.hash(key);

  const apiKey = await db.query(ApiKeyModel)
    .where("keyHash", "=", hash)
    .where("revoked", "=", false)
    .get();

  if (!apiKey) {
    throw new UnauthorizedError("API 密钥无效");
  }

  // 更新最后使用时间
  await db.query(ApiKeyModel)
    .where("id", "=", apiKey.id)
    .update({ lastUsedAt: new Date() });

  ctx.state.apiKey = apiKey;
  ctx.state.userId = apiKey.userId;
  await next();
};
```

## 使用 verify 进行恒定时间校验

```typescript
// 若已存储 keyHash，可直接使用 verify 进行恒定时间比较
const apiKeyAuth: Middleware = async (ctx, next) => {
  const key = ctx.headers.get("x-api-key");
  if (!key) {
    throw new UnauthorizedError("缺少 API 密钥");
  }

  // 从数据库中查询可能的 API Key 记录（需配合其他条件缩小范围）
  const apiKeyRecords = await db.query(ApiKeyModel)
    .where("revoked", "=", false)
    .all();

  // 使用恒定时间比较逐个验证（防止时序攻击）
  for (const record of apiKeyRecords) {
    const valid = await apiKeys.verify(key, record.keyHash);
    if (valid) {
      ctx.state.apiKey = record;
      ctx.state.userId = record.userId;
      return next();
    }
  }

  throw new UnauthorizedError("API 密钥无效");
};
```

## 撤销 API 密钥

```typescript
router.delete("/api-keys/:id<int>", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;

  await db.query(ApiKeyModel)
    .where("id", "=", ctx.params.id)
    .where("userId", "=", userId)  // 只能撤销自己的密钥
    .update({ revoked: true, revokedAt: new Date() });

  return ctx.json({ ok: true });
});
```

## ApiKeyManager 接口

```typescript
/** API Key 管理器接口 */
interface ApiKeyManager {
  /**
   * 生成新的 API Key 及其哈希值
   * @param metadata 可选的元数据（如租户、用途、创建者）
   * @returns 包含明文 key、哈希值和元数据的对象
   */
  generate(metadata?: Record<string, unknown>): Promise<{
    /** 明文 API Key（仅生成时返回一次，需妥善保存） */
    key: string;
    /** API Key 的 SHA-256 哈希值（用于持久化存储） */
    hash: string;
    /** 可选的元数据 */
    metadata?: Record<string, unknown>;
  }>;

  /**
   * 对 API Key 进行哈希
   * @param key 明文 API Key
   * @returns SHA-256 哈希值
   */
  hash(key: string): Promise<string>;

  /**
   * 校验 API Key 是否与存储的哈希匹配
   * @param key 明文 API Key
   * @param storedHash 存储的哈希值
   * @returns 匹配返回 true，否则返回 false
   */
  verify(key: string, storedHash: string): Promise<boolean>;
}
```

## 注意事项

- `createApiKeyManager()` 不接收任何参数
- `generate(metadata?)` 返回 `Promise<{ key, hash, metadata? }>`
- `hash(key)` 是异步方法，返回 `Promise<string>`
- `verify(key, storedHash)` 是异步方法，使用恒定时间比较防止时序攻击
- 数据库中必须存储 `hash`（`keyHash`），绝不能存储原始 `key`
- 生成的 Key 格式为 `ak_{prefix}_{uuid}`，前缀为 8 位十六进制随机字符串
