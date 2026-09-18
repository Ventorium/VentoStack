---
title: OAuth 2.0 与 OpenID Connect
description: VentoStack 平台统一认证、SSO、应用门户与子应用接入说明
---

`@ventostack/oauth` 是平台层的 OAuth 2.0 Authorization Server 与 OpenID Provider。它面向受信任的服务端子应用，采用 Authorization Code、PKCE S256、OpenID Connect 和 RS256 签名。浏览器只接收一次性授权码，Access Token 与 Refresh Token 应保存在子应用 BFF 中。

## 启用模块

Admin API 默认关闭 OAuth 模块。启用前配置以下环境变量：

```dotenv
OAUTH_ENABLED=true
OAUTH_ISSUER=https://id.company.com/api/oauth
OAUTH_SECRET_PEPPER=<至少 32 字节的独立随机值>
OAUTH_SIGNING_KEY_ID=oauth-signing-2026-01
OAUTH_PRIVATE_KEY_PEM=<PKCS8 RSA 私钥 PEM>
OAUTH_PUBLIC_KEY_PEM=<SPKI RSA 公钥 PEM>
OAUTH_VERIFYING_JWKS={"keys":[]}
```

生产环境的 issuer、首页、回调和退出地址必须使用 HTTPS。开发环境只有显式启用 `OAUTH_ALLOW_LOOPBACK_HTTP` 时才允许 `localhost`、`127.0.0.1` 或 `[::1]` 使用 HTTP。

模块启用后会注册 `/api/oauth` 下的协议端点和管理端点。RFC 8414 授权服务器元数据位于 `/.well-known/oauth-authorization-server/api/oauth`。

## 子应用接入

1. 平台管理员在“认证中心 → 应用管理”注册 Application，配置精确回调 URI、允许的 Scope 和访问范围。
2. 子应用安全保存只展示一次的 `client_id` 与 `client_secret`。
3. 子应用为每次登录生成高熵 `state`、`nonce`、`code_verifier`，并使用 SHA-256 生成 `code_challenge`。
4. 浏览器跳转到授权端点。认证中心复用已有 SSO Session，或要求用户登录。
5. 子应用后端校验 `state` 与响应中的 `iss`，再用授权码、`code_verifier` 和 HTTP Basic 客户端认证调用 Token 端点。
6. 子应用校验 ID Token 的签名、`iss`、`aud`、`exp`、`nonce`，在服务端建立自己的 HttpOnly Session。
7. 子应用后端使用 Access Token 调用 `/api/oauth/me/context` 获取当前 Application 范围内的用户、角色、部门、权限和菜单。

授权请求示例：

```text
GET /api/oauth/authorize
  ?response_type=code
  &client_id=...
  &redirect_uri=https%3A%2F%2Fapp.company.com%2Foauth%2Fcallback
  &scope=openid%20profile%20context
  &state=...
  &nonce=...
  &code_challenge=...
  &code_challenge_method=S256
```

换取 Token 时必须使用 `application/x-www-form-urlencoded`，并通过 `Authorization: Basic ...` 提交客户端凭据。不得在 URL 中传递 Token。

## 协议端点

| 端点 | 用途 |
| --- | --- |
| `/api/oauth/.well-known/openid-configuration` | OpenID Provider 元数据 |
| `/api/oauth/jwks` | RS256 公钥集合 |
| `/api/oauth/authorize` | Authorization Code 授权 |
| `/api/oauth/token` | 授权码交换与 Refresh Token 轮换 |
| `/api/oauth/revoke` | RFC 7009 Token 撤销 |
| `/api/oauth/introspect` | RFC 7662 Token 校验 |
| `/api/oauth/logout` | RP-Initiated Logout 与全局退出 |
| `/api/oauth/me/context` | Application 身份上下文 |

Refresh Token 每次使用后都会轮换。再次使用已经消费的旧 Token 会撤销整个 Token family。全局退出会撤销 SSO Session、子应用 Session、Access Token 和 Refresh Token；配置了 Back-Channel Logout URI 的应用还会收到带 `sid` 的 OIDC `logout_token`。投递使用数据库 outbox、并发领取和有限重试。

## Scope 与上下文

`openid` 始终必需。`profile` 控制基础用户信息；`roles.read`、`departments.read`、`permissions.read`、`menus.read` 分别控制上下文字段。`offline_access` 只有在 Application 明确允许后才能申请。

应用菜单记录在现有 `sys_menu` 中并通过 `application_id` 隔离。管理后台自身菜单只读取 `application_id IS NULL`，子应用上下文只返回当前 Application 的菜单。角色、用户和部门授权按当前租户计算，子应用不能直接访问平台用户数据库。

## 安全约束

- 只支持 confidential BFF 客户端和 `client_secret_basic`。
- Redirect URI 与 Post Logout Redirect URI 必须逐字匹配注册值。
- 授权码只存摘要、仅能消费一次，默认有效期 60 秒。
- Access Token 使用 `RS256` 和固定 `kid`，JWKS 响应支持缓存与 ETag。
- Secret 只在创建或重置时返回一次，数据库仅保存带独立 pepper 的 HMAC 摘要。
- 管理端应用注册与 Secret 操作需要实时平台管理员身份和 OAuth 权限。
- SSO Cookie 使用 `HttpOnly`、`SameSite=Lax`，生产环境增加 `Secure` 与 `__Host-` 前缀。
- 非法客户端或非法 Redirect URI 不执行回跳；已验证回调上的协议错误保留原始 `state` 并返回 `iss`。
- 认证日志不记录授权码、Token、Secret、Cookie 或完整请求体。

当前签名配置使用单个活动 RSA 密钥。轮换时应先发布新公钥，等待旧 Token 生命周期结束后再移除旧公钥；部署系统需要保证所有实例共享一致的签名密钥和 `kid`。

Secret 重新生成和 Application 永久删除要求当前后台 Session 在最近 10 分钟内完成过密码、MFA 或 Passkey 认证。超过时限或升级前创建的 Session 需要先重新登录。

Back-Channel Logout 在应用层执行 HTTPS、端口、DNS 与公网地址检查，并禁止重定向。生产环境仍必须用 NetworkPolicy 或等价出口策略限定认证中心可访问的目的地，作为 DNS rebinding 和运行时网络绕过的最终边界。

仓库中的 `apps/oauth-bff-example` 提供可运行的接入示例，包含 Discovery、PKCE、`state`/`nonce`、ID Token 验签、服务端 Token 保存、深层链接恢复和 RP-Initiated Logout。该示例使用内存 Session，只用于本地互操作验证。
