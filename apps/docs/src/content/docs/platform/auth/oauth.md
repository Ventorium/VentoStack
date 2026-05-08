---
order: 5
title: OAuth 2.0
description: 使用 createOAuth 集成第三方 OAuth 认证
---

`createOAuth` 提供了标准 OAuth 2.0 授权码流程的完整实现，支持 state 参数防 CSRF，内置 GitHub 与 Google 提供商预设配置。

## 基本用法

```typescript
import { createOAuth } from "@ventostack/auth";

const oauth = createOAuth();

// 创建 GitHub 提供商配置
const github = oauth.github({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  redirectURL: "https://yourapp.com/auth/github/callback",
});

// 创建 Google 提供商配置
const google = oauth.google({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectURL: "https://yourapp.com/auth/google/callback",
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

  const authUrl = oauth.getAuthorizationURL(github, state);
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
  const tokens = await oauth.exchangeCode(github, code);

  // 获取用户信息
  const userInfo = await oauth.getUserInfo(github, tokens.accessToken);

  // 查找或创建用户
  let user = await db.query(UserModel).where("githubId", "=", userInfo.id).get();
  if (!user) {
    user = await db.query(UserModel).insert({
      githubId: userInfo.id,
      name: userInfo.name,
      email: userInfo.email,
      avatar: userInfo.avatar,
      role: "user",
    }, { returning: true });
  }

  // 签发应用 JWT
  const token = await jwt.sign({ sub: user.id, role: user.role });
  return ctx.redirect(`/dashboard?token=${token}`);
});
```

## 自定义 Provider

自定义提供商是一个普通的 `OAuthProvider` 对象，不是函数调用：

```typescript
import type { OAuthProvider } from "@ventostack/auth";

const customProvider: OAuthProvider = {
  name: "custom",
  authorizationURL: "https://auth.example.com/oauth/authorize",
  tokenURL: "https://auth.example.com/oauth/token",
  userInfoURL: "https://auth.example.com/api/user",
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!,
  scopes: ["openid", "profile", "email"],
  redirectURL: "https://yourapp.com/auth/custom/callback",
};

// 使用自定义提供商
const authUrl = oauth.getAuthorizationURL(customProvider, state);
const tokens = await oauth.exchangeCode(customProvider, code);
const userInfo = await oauth.getUserInfo(customProvider, tokens.accessToken);
```

## OAuth 接口

```typescript
/** OAuth2 提供商配置 */
interface OAuthProvider {
  /** 提供商名称 */
  name: string;
  /** 授权端点 URL */
  authorizationURL: string;
  /** Token 端点 URL */
  tokenURL: string;
  /** 用户信息端点 URL（可选） */
  userInfoURL?: string;
  /** 客户端 ID */
  clientId: string;
  /** 客户端密钥 */
  clientSecret: string;
  /** 请求的权限范围 */
  scopes: string[];
  /** 回调地址 */
  redirectURL: string;
}

/** OAuth2 Token 响应数据 */
interface OAuthTokenResponse {
  /** 访问令牌 */
  accessToken: string;
  /** 令牌类型（如 bearer） */
  tokenType: string;
  /** 过期时间（秒） */
  expiresIn?: number;
  /** 刷新令牌 */
  refreshToken?: string;
  /** 授权的权限范围 */
  scope?: string;
  /** ID Token（OIDC） */
  idToken?: string;
}

/** OAuth2 用户信息 */
interface OAuthUserInfo {
  /** 用户在提供商处的唯一标识 */
  id: string;
  /** 用户邮箱 */
  email?: string;
  /** 用户姓名 */
  name?: string;
  /** 用户头像 URL */
  avatar?: string;
  /** 原始响应数据 */
  raw: Record<string, unknown>;
}

/** OAuth2 管理器接口 */
interface OAuthManager {
  /**
   * 生成授权 URL
   * @param provider OAuth 提供商配置
   * @param state 防 CSRF 的 state 参数
   * @returns 完整的授权跳转 URL
   */
  getAuthorizationURL(provider: OAuthProvider, state: string): string;

  /**
   * 用授权码换取访问令牌
   * @param provider OAuth 提供商配置
   * @param code 授权码
   * @returns Token 响应数据
   */
  exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthTokenResponse>;

  /**
   * 获取用户信息
   * @param provider OAuth 提供商配置（需配置 userInfoURL）
   * @param accessToken 访问令牌
   * @returns 用户信息
   */
  getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserInfo>;

  /**
   * 创建 GitHub OAuth 提供商配置
   * @param config 客户端配置
   * @returns GitHub 提供商配置
   */
  github(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;

  /**
   * 创建 Google OAuth 提供商配置
   * @param config 客户端配置
   * @returns Google 提供商配置
   */
  google(config: {
    clientId: string;
    clientSecret: string;
    redirectURL: string;
  }): OAuthProvider;
}
```

## 注意事项

- `createOAuth()` 返回 `OAuthManager` 实例，不是 `createOAuthProvider()`
- 内置 `github()` / `google()` 是 `OAuthManager` 上的方法，返回 `OAuthProvider` 配置对象
- `redirectURL` 使用大写的 `URL` 结尾，不是 `redirectUri`
- `getUserInfo()` 需要提供商配置中包含 `userInfoURL`
- 自定义提供商是普通的 `OAuthProvider` 对象，直接传入方法使用
