---
order: 6
title: MFA 多因素认证
description: 使用 createTOTP 添加基于 TOTP 的多因素认证
---

`createTOTP` 提供了基于 TOTP（时间一次性密码，RFC 6238）的多因素认证，基于 Web Crypto API HMAC 实现，兼容 Google Authenticator 等标准 TOTP 客户端。

## 基本用法

```typescript
import { createTOTP } from "@ventostack/auth";

const totp = createTOTP({
  digits: 6,              // 验证码位数，默认 6
  period: 30,             // 时间步长（秒），默认 30
  algorithm: "SHA-1",     // 哈希算法，默认 SHA-1（兼容性最佳）
  window: 1,              // 时间窗口容差，默认 1
});
```

## 绑定 MFA

```typescript
// 第一步：为用户生成 TOTP Secret
router.post("/auth/mfa/setup", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;

  const secret = totp.generateSecret();
  // secret: "JBSWY3DPEHPK3PXP" (Base32 编码的随机密钥)

  const uri = totp.generateURI(secret, "MyApp", ctx.state.user.email);
  // uri: "otpauth://totp/MyApp:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp..."
  // 将 uri 生成二维码供用户扫描

  // 将 secret 临时存储（绑定完成前不要持久化）
  await cache.set(`mfa:pending:${userId}`, secret, 300);

  return ctx.json({ secret, uri });
});

// 第二步：验证用户扫码后输入的验证码
router.post("/auth/mfa/verify-setup", authMiddleware, async (ctx) => {
  const userId = ctx.state.user.sub;
  const { code } = await ctx.request.json() as { code: string };

  const secret = await cache.get<string>(`mfa:pending:${userId}`);
  if (!secret) {
    throw new UnauthorizedError("MFA 设置已过期，请重新开始");
  }

  const valid = await totp.verify(secret, code);
  if (!valid) {
    throw new UnauthorizedError("验证码错误");
  }

  // 持久化 secret
  await db.query(UserModel).where("id", "=", userId).update({
    mfaSecret: secret,
    mfaEnabled: true,
  });

  await cache.delete(`mfa:pending:${userId}`);
  return ctx.json({ enabled: true });
});
```

## 登录时验证 MFA

```typescript
router.post("/auth/login", async (ctx) => {
  const { email, password, mfaCode } = await ctx.request.json() as {
    email: string;
    password: string;
    mfaCode?: string;
  };

  const user = await authenticateUser(email, password);

  // 如果启用了 MFA
  if (user.mfaEnabled) {
    if (!mfaCode) {
      return ctx.json({ requiresMFA: true }, 200);
    }

    const valid = await totp.verify(user.mfaSecret, mfaCode);
    if (!valid) {
      throw new UnauthorizedError("MFA 验证码错误");
    }
  }

  const token = await jwt.sign({ sub: user.id, role: user.role });
  return ctx.json({ token });
});
```

## 生成验证码（服务端调试或测试用）

```typescript
// 生成当前时间步的验证码（通常由用户的 Authenticator App 生成）
const code = await totp.generate(secret);
// code: "123456"

// 指定时间生成验证码
const codeAtTime = await totp.generate(secret, Math.floor(Date.now() / 1000));
```

## TOTP 接口

```typescript
/** TOTP 管理器配置选项 */
interface TOTPOptions {
  /** 验证码位数，默认 6 */
  digits?: number;
  /** 时间步长（秒），默认 30 */
  period?: number;
  /** 哈希算法，默认 SHA-1（兼容性最佳） */
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512";
  /** 时间窗口容差（前后各多少个时间窗口），默认 1 */
  window?: number;
}

/** TOTP 管理器接口 */
interface TOTPManager {
  /**
   * 生成随机 Base32 编码的密钥
   * @returns Base32 密钥字符串
   */
  generateSecret(): string;

  /**
   * 生成 otpauth:// URI（用于二维码扫描）
   * @param secret Base32 密钥
   * @param issuer 服务名称/发行方
   * @param account 用户账号
   * @returns otpauth URI 字符串
   */
  generateURI(secret: string, issuer: string, account: string): string;

  /**
   * 生成当前时间步的 TOTP 验证码
   * @param secret Base32 密钥
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 数字验证码字符串
   */
  generate(secret: string, time?: number): Promise<string>;

  /**
   * 校验 TOTP 验证码
   * @param secret Base32 密钥
   * @param token 用户输入的验证码
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 校验通过返回 true，否则返回 false
   */
  verify(secret: string, token: string, time?: number): Promise<boolean>;
}
```

## 注意事项

- 使用 `createTOTP(options?)` 创建管理器，不是 `createMFAManager()`
- `algorithm` 取值带连字符：`"SHA-1"`、`"SHA-256"`、`"SHA-512"`，不是 `"SHA1"`
- `generateSecret()` 返回 `string`（Base32 密钥），不是包含 `qrCodeUrl` 和 `backupCodes` 的对象
- `generateURI(secret, issuer, account)` 单独生成 otpauth URI，需自行转换为二维码
- `verify(secret, token)` 和 `generate(secret)` 都是异步方法，返回 `Promise`
- `verify()` 会在 `window` 指定的时间窗口内前后检查，容忍轻微的时间偏差
