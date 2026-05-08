---
order: 2
title: JWT 认证
description: 使用 createJWT 实现无状态 JSON Web Token 认证
---

`createJWT` 提供了完整的 JWT 签发和验证功能，基于 Web Crypto API，仅支持 HMAC 算法（HS256 / HS384 / HS512）。

## 基本用法

### 初始化时传入默认密钥

推荐在初始化时配置默认密钥和选项，后续 `sign` / `verify` 无需重复传入：

```typescript
import { createJWT } from "@ventostack/auth";

const jwt = createJWT({
  secret: process.env.JWT_SECRET!,
  defaultOptions: {
    expiresIn: 7 * 24 * 60 * 60, // 7 天，单位：秒
    algorithm: "HS256",
  },
});
```

### 不传入默认密钥（每次调用显式指定）

适用于多租户或多密钥轮换场景：

```typescript
const jwt = createJWT();
```

## 签发 Token

```typescript
// 登录路由 —— 已配置默认密钥时，无需再传 secret
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.request.json() as { email: string; password: string };

  const user = await findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError("邮箱或密码错误");
  }

  // 使用默认 secret 和 expiresIn
  const token = await jwt.sign({
    sub: String(user.id),
    email: user.email,
    role: user.role,
  });

  return ctx.json({ token, expiresIn: 7 * 24 * 60 * 60 });
});
```

也可以在单次调用中覆盖默认配置：

```typescript
// 短期访问 Token（覆盖默认过期时间）
const accessToken = await jwt.sign(
  { sub: user.id, type: "access" },
  undefined, // 使用默认 secret
  { expiresIn: 15 * 60 } // 15 分钟
);
```

## 验证 Token

```typescript
// 认证中间件 —— 已配置默认密钥时，无需再传 secret
const authMiddleware: Middleware = async (ctx, next) => {
  const authHeader = ctx.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("缺少认证 Token");
  }

  const token = authHeader.slice(7);

  try {
    const payload = await jwt.verify(token);
    ctx.state.set("user", payload);
  } catch (err) {
    throw new UnauthorizedError("Token 无效或已过期");
  }

  return next();
};
```

## 刷新 Token

```typescript
// 签发双 Token
const accessToken = await jwt.sign({ sub: user.id, type: "access" }, undefined, { expiresIn: 15 * 60 });
const refreshToken = await jwt.sign({ sub: user.id, type: "refresh" }, undefined, { expiresIn: 30 * 24 * 60 * 60 });

// 使用刷新 Token 获取新的访问 Token
router.post("/auth/refresh", async (ctx) => {
  const { refreshToken } = await ctx.request.json() as { refreshToken: string };

  const payload = await jwt.verify(refreshToken);
  if (payload.type !== "refresh") {
    throw new UnauthorizedError("无效的刷新 Token");
  }

  const newAccessToken = await jwt.sign({ sub: payload.sub, type: "access" }, undefined, { expiresIn: 15 * 60 });
  return ctx.json({ accessToken: newAccessToken });
});
```

## Token 刷新管理

对于需要 Access Token / Refresh Token 分离和轮换的场景，可使用 `createTokenRefresh`：

```typescript
import { createJWT, createTokenRefresh } from "@ventostack/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const tokenRefresh = createTokenRefresh(jwt, {
  accessTokenTTL: 900,      // 15 分钟
  refreshTokenTTL: 604800,  // 7 天
});

// 生成 Token 对（必须显式传入 secret，不会使用 JWT 的默认密钥）
const pair = await tokenRefresh.generatePair(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET!,
);
// pair: { accessToken, refreshToken, expiresIn, refreshExpiresIn }

// 用 Refresh Token 换取新 Token 对（旧 Refresh Token 自动吊销）
const newPair = await tokenRefresh.refresh(pair.refreshToken, process.env.JWT_SECRET!);

// 手动吊销 Token
await tokenRefresh.revoke(jti);
const isRevoked = await tokenRefresh.isRevoked(jti);
```

## JWT 接口

```typescript
/** 支持的 JWT 签名算法 */
type JWTAlgorithm = "HS256" | "HS384" | "HS512";

/** JWT Payload 标准字段与自定义扩展 */
interface JWTPayload {
  /** 主题（用户标识） */
  sub?: string;
  /** 签发者 */
  iss?: string;
  /** 受众 */
  aud?: string;
  /** 过期时间（Unix 时间戳，秒） */
  exp?: number;
  /** 生效时间（Unix 时间戳，秒） */
  nbf?: number;
  /** 签发时间（Unix 时间戳，秒） */
  iat?: number;
  /** JWT ID（唯一标识） */
  jti?: string;
  /** 自定义扩展字段 */
  [key: string]: unknown;
}

/** JWT 签名与验证选项 */
interface JWTOptions {
  /** 签名算法，默认 HS256 */
  algorithm?: JWTAlgorithm;
  /** 签发者 */
  issuer?: string;
  /** 受众 */
  audience?: string;
  /** 过期时长（秒） */
  expiresIn?: number;
}

/** JWT 管理器配置 */
interface JWTConfig {
  /** 默认密钥 */
  secret?: string;
  /** 默认选项 */
  defaultOptions?: JWTOptions;
}

/** JWT 管理器接口 */
interface JWTManager {
  /**
   * 签发 JWT
   * @param payload JWT 载荷数据
   * @param secret 密钥（可选，默认使用配置中的密钥）
   * @param options 签名选项（可选，默认使用配置中的选项）
   * @returns 签发的 JWT 字符串
   */
  sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string>;

  /**
   * 验证 JWT
   * @param token JWT 字符串
   * @param secret 密钥（可选）
   * @param options 验证选项（可选）
   * @returns 验证通过后的 Payload
   * @throws UnauthorizedError 验证失败时抛出
   */
  verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload>;

  /**
   * 解码 JWT（不验证签名）
   * @param token JWT 字符串
   * @returns Payload 对象，格式错误返回 null
   */
  decode(token: string): JWTPayload | null;
}
```

## TokenRefresh 接口

```typescript
/** Token 对结构 */
interface TokenPair {
  /** 访问令牌（短有效期） */
  accessToken: string;
  /** 刷新令牌（长有效期） */
  refreshToken: string;
  /** 访问令牌过期时间（秒） */
  expiresIn: number;
  /** 刷新令牌过期时间（秒） */
  refreshExpiresIn: number;
}

/** Token 刷新管理器配置选项 */
interface TokenRefreshOptions {
  /** 访问令牌 TTL（秒），默认 900（15 分钟） */
  accessTokenTTL?: number;
  /** 刷新令牌 TTL（秒），默认 604800（7 天） */
  refreshTokenTTL?: number;
  /** 可选的独立刷新令牌密钥，不传则使用 JWT 的 secret */
  refreshSecret?: string;
}

/** Token 刷新管理器接口 */
interface TokenRefreshManager {
  /** 生成新的 Access Token 与 Refresh Token 对（secret 为必填参数） */
  generatePair(payload: Record<string, unknown>, secret: string): Promise<TokenPair>;
  /** 用 Refresh Token 换取新的 Token 对（旧的 Refresh Token 会被吊销，secret 为必填参数） */
  refresh(refreshToken: string, secret: string): Promise<TokenPair>;
  /** 吊销指定 JTI 的 Token */
  revoke(jti: string): Promise<void>;
  /** 判断指定 JTI 是否已被吊销 */
  isRevoked(jti: string): Promise<boolean>;
}
```

## 安全约束

- 密钥长度必须 >= 32 字节（256-bit），否则 `sign` / `verify` 会直接抛错
- 仅支持 `HS256`、`HS384`、`HS512`，不支持 `RS256` / `RS384` / `RS512`
- 签名验证使用 `crypto.subtle.verify`，恒定时间比较，防止时序攻击
- 生产环境密钥应支持版本化与轮换，禁止硬编码在代码中
