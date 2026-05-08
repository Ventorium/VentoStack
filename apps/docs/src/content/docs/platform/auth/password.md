---
order: 12
title: 密码哈希
description: 使用 createPasswordHasher 基于 Bun.password 实现安全的密码哈希与验证
---

`createPasswordHasher` 提供了密码哈希与验证能力，基于 `Bun.password` 实现，默认使用 bcrypt 算法。**禁止明文存储密码。**

## 基本用法

```typescript
import { createPasswordHasher } from "@ventostack/auth";

const hasher = createPasswordHasher();

// 哈希密码
const hash = await hasher.hash("my-secure-password");
// "$2b$10$..."

// 验证密码
const valid = await hasher.verify("my-secure-password", hash); // true
const invalid = await hasher.verify("wrong-password", hash);    // false
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `algorithm` | `"bcrypt"` | `"bcrypt"` | 哈希算法，目前仅支持 bcrypt |
| `cost` | `number` | `10` | bcrypt 成本因子，值越大越安全但越慢 |

```typescript
// 提高安全强度（适合后台服务）
const hasher = createPasswordHasher({ cost: 12 });

// 开发环境可降低成本加快速度
const hasher = createPasswordHasher({ cost: 4 });
```

## 接口参考

```typescript
interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

interface PasswordHasherOptions {
  algorithm?: "bcrypt";
  cost?: number;
}
```

## 注意事项

- 基于 `Bun.password`，仅在 Bun 运行时下可用
- bcrypt 成本因子每增加 1，哈希时间约翻倍，生产环境建议 10-12
- `hash` 和 `verify` 均为异步方法，避免在主线程阻塞
- `algorithm` 传入非 `"bcrypt"` 的值会抛出异常
