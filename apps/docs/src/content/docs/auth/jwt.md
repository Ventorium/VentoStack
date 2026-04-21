---
title: JWT 认证
description: 使用 createJWT 实现无状态 JSON Web Token 认证
---

`createJWT` 提供了完整的 JWT 签发和验证功能，支持 HS256、RS256 等算法。

## 基本用法

```typescript
import { createJWT } from "@aeron/auth";

const jwt = createJWT({
  secret: process.env.JWT_SECRET!,
  expiresIn: "7d",   // Token 有效期
  algorithm: "HS256" // 默认算法
});
```

## 签发 Token

```typescript
// 登录路由
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.body<{ email: string; password: string }>();

  const user = await findUserByEmail(email);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new UnauthorizedError("邮箱或密码错误");
  }

  // 签发 Token
  const token = await jwt.sign({
    sub: user.id,           // 用户 ID
    email: user.email,
    role: user.role,
  });

  return ctx.json({ token, expiresIn: "7d" });
});
```

## 验证 Token

```typescript
// 认证中间件
const authMiddleware: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("缺少认证 Token");
  }

  const token = authHeader.slice(7);

  try {
    const payload = await jwt.verify(token);
    ctx.state.user = payload;
  } catch (err) {
    throw new UnauthorizedError("Token 无效或已过期");
  }

  await next();
};
```

## 刷新 Token

```typescript
// 签发刷新 Token（更长有效期）
const accessToken = await jwt.sign({ sub: user.id, type: "access" }, { expiresIn: "15m" });
const refreshToken = await jwt.sign({ sub: user.id, type: "refresh" }, { expiresIn: "30d" });

// 使用刷新 Token 获取新的访问 Token
router.post("/auth/refresh", async (ctx) => {
  const { refreshToken } = await ctx.body<{ refreshToken: string }>();

  const payload = await jwt.verify(refreshToken);
  if (payload.type !== "refresh") {
    throw new UnauthorizedError("无效的刷新 Token");
  }

  const newAccessToken = await jwt.sign({ sub: payload.sub, type: "access" }, { expiresIn: "15m" });
  return ctx.json({ accessToken: newAccessToken });
});
```

## 非对称加密（RS256）

使用 RSA 密钥对，适合多服务之间共享验证：

```typescript
const jwt = createJWT({
  privateKey: process.env.JWT_PRIVATE_KEY!,  // 私钥（签发）
  publicKey: process.env.JWT_PUBLIC_KEY!,    // 公钥（验证）
  algorithm: "RS256",
  expiresIn: "1h",
});
```

## JWT 接口

```typescript
interface JWTOptions {
  secret?: string;
  privateKey?: string;
  publicKey?: string;
  algorithm?: "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512";
  expiresIn?: string | number;
}

interface JWT {
  sign(payload: Record<string, unknown>, options?: Partial<JWTOptions>): Promise<string>;
  verify<T = Record<string, unknown>>(token: string): Promise<T>;
  decode<T = Record<string, unknown>>(token: string): T | null;
}
```
