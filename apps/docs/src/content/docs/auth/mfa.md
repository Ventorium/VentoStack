---
title: MFA 多因素认证
description: 使用 createMFAManager 添加 TOTP 或短信验证的多因素认证
---

`createMFAManager` 提供了基于 TOTP（时间一次性密码）的多因素认证，兼容 Google Authenticator、Authy 等主流验证器 App。

## 基本用法

```typescript
import { createMFAManager } from "@aeron/auth";

const mfa = createMFAManager({
  issuer: "MyApp",        // 显示在验证器 App 中的名称
  algorithm: "SHA1",      // 默认 SHA1，兼容性最好
  digits: 6,              // 验证码位数
  period: 30,             // 有效期（秒）
});
```

## 绑定 MFA

```typescript
// 第一步：为用户生成 MFA Secret
router.post("/auth/mfa/setup", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;

  const { secret, qrCodeUrl } = await mfa.generateSecret({
    accountName: ctx.state.user.email,
  });

  // 将 secret 临时存储（绑定完成前不要持久化）
  await cache.set(`mfa:pending:${userId}`, secret, 300);

  return ctx.json({ qrCodeUrl, secret });
});

// 第二步：验证用户扫码后输入的验证码
router.post("/auth/mfa/verify-setup", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;
  const { code } = await ctx.body<{ code: string }>();

  const secret = await cache.get<string>(`mfa:pending:${userId}`);
  if (!secret) {
    throw new UnauthorizedError("MFA 设置已过期，请重新开始");
  }

  const valid = mfa.verify(code, secret);
  if (!valid) {
    throw new UnauthorizedError("验证码错误");
  }

  // 持久化 secret
  await db.update("users")
    .set({ mfa_secret: secret, mfa_enabled: true })
    .where("id", "=", userId)
    .execute();

  await cache.delete(`mfa:pending:${userId}`);
  return ctx.json({ enabled: true });
});
```

## 登录时验证 MFA

```typescript
router.post("/auth/login", async (ctx) => {
  const { email, password, mfaCode } = await ctx.body<{
    email: string;
    password: string;
    mfaCode?: string;
  }>();

  const user = await authenticateUser(email, password);

  // 如果启用了 MFA
  if (user.mfa_enabled) {
    if (!mfaCode) {
      return ctx.json({ requiresMFA: true }, 200);
    }

    const valid = mfa.verify(mfaCode, user.mfa_secret);
    if (!valid) {
      throw new UnauthorizedError("MFA 验证码错误");
    }
  }

  const token = await jwt.sign({ sub: user.id, role: user.role });
  return ctx.json({ token });
});
```

## MFAManager 接口

```typescript
interface MFAManager {
  generateSecret(options: { accountName: string }): Promise<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  }>;
  verify(code: string, secret: string): boolean;
  generateCode(secret: string): string;
}
```
