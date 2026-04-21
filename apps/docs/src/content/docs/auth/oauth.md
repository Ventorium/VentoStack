---
title: OAuth 2.0
description: 使用 createOAuthProvider 集成第三方 OAuth 认证
---

`createOAuthProvider` 提供了标准 OAuth 2.0 授权码流程的完整实现。

## 支持的 Provider

- GitHub
- Google
- 自定义 OAuth 2.0 提供商

## 基本配置

```typescript
import { createOAuthProvider } from "@aeron/auth";

const github = createOAuthProvider({
  provider: "github",
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectUri: "https://yourapp.com/auth/github/callback",
  scopes: ["read:user", "user:email"],
});
```

## 完整认证流程

```typescript
const router = createRouter();

// 第一步：重定向到 OAuth 提供商
router.get("/auth/github", async (ctx) => {
  const state = crypto.randomUUID();
  // 将 state 存入 session 防止 CSRF
  await cache.set(`oauth:state:${state}`, true, 300);

  const authUrl = github.getAuthorizationUrl(state);
  return ctx.redirect(authUrl);
});

// 第二步：处理回调
router.get("/auth/github/callback", async (ctx) => {
  const { code, state } = ctx.query;

  // 验证 state 防止 CSRF
  const valid = await cache.get(`oauth:state:${state}`);
  if (!valid) {
    throw new UnauthorizedError("Invalid state parameter");
  }
  await cache.delete(`oauth:state:${state}`);

  // 用 code 换取 access token
  const tokens = await github.exchangeCode(code);

  // 获取用户信息
  const userInfo = await github.getUserInfo(tokens.accessToken);

  // 查找或创建用户
  let user = await db.from("users").where("github_id", "=", userInfo.id).first();
  if (!user) {
    user = await db.insert("users", {
      github_id: userInfo.id,
      name: userInfo.name,
      email: userInfo.email,
      avatar: userInfo.avatar_url,
    }).returning("*").first();
  }

  // 签发应用 JWT
  const token = await jwt.sign({ sub: user.id, role: user.role });
  return ctx.redirect(`/dashboard?token=${token}`);
});
```

## 自定义 Provider

```typescript
const customOAuth = createOAuthProvider({
  provider: "custom",
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
  authorizationUrl: "https://auth.example.com/oauth/authorize",
  tokenUrl: "https://auth.example.com/oauth/token",
  userInfoUrl: "https://auth.example.com/api/user",
  scopes: ["openid", "profile", "email"],
});
```

## OAuthProvider 接口

```typescript
interface OAuthProviderConfig {
  provider: "github" | "google" | "custom";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
}

interface OAuthProvider {
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  refreshToken(refreshToken: string): Promise<OAuthTokens>;
}
```
