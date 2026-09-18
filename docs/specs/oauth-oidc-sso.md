# VentoStack OAuth 2.0 / OpenID Connect 统一认证与 SSO 规格

> 状态：已实施；以第 21 节的验证记录与运行边界为准
>
> 目标模块：`packages/platform/oauth`
>
> 管理端：`apps/admin/api`、`apps/admin/web`
>
> 协议基线：OAuth 2.0 + OpenID Connect + Authorization Code + PKCE（S256）

## 1. 背景与目标

VentoStack Admin 已有用户、密码、MFA、Passkey、角色、菜单、部门、Session、Access Token、Refresh Token 和 Token 撤销等能力，但当前系统不是 OAuth 2.0 Authorization Server，也不是 OpenID Provider。

现有 `packages/platform/auth/src/oauth.ts` 是第三方 OAuth 客户端工具，用于让 VentoStack 接入 GitHub、Google 等外部提供商，不能承担本需求中的授权码签发、PKCE 校验、OIDC Discovery、JWKS、客户端注册和统一 SSO。

本需求新增一个平台级 OAuth/OIDC 模块，使内部业务应用只需完成以下工作：

1. 在统一认证中心注册 Application。
2. 使用 OIDC Authorization Code + PKCE 接入统一登录。
3. 使用 Access Token 获取当前用户在该 Application 下的统一身份上下文。

子应用不直接读取 VentoStack 用户数据库，也不关心密码、MFA、Passkey、Session、组织架构或权限存储的内部实现。

## 2. 已确认的产品边界

### 2.1 模块归属

- 新增 `packages/platform/oauth`，作为平台层模块。
- 通过 `packages/platform/boot` 注册和启用。
- `apps/admin/api` 作为 Composition Root，只负责注入数据库、缓存、Session、签名密钥、审计、事件和 OSS 等依赖。
- `apps/admin/web` 提供 Application 管理、门户和 OAuth 日志界面。
- `packages/platform/auth` 继续保持纯认证引擎定位，不放置 Application 业务表和 OAuth/OIDC 路由。

### 2.2 支持的客户端

首期仅支持机密 BFF 客户端：

```text
Browser
   ↓ HttpOnly Local Session Cookie
Sub Application Backend (BFF)
   ↓ Authorization Code + PKCE / Token
VentoStack Authorization Server
```

- BFF 持有 `clientSecret` 和 PKCE `code_verifier`。
- 浏览器不长期持有 OAuth Access Token 或 Refresh Token。
- 不支持 SPA public client、Implicit Flow、Resource Owner Password Grant 和 URL Token 传递。
- Token、Secret、Cookie 禁止出现在查询参数、浏览器存储、日志或 Referer 中。

### 2.3 标准基线

实现遵循：

- OAuth 2.0 Authorization Code Grant。
- OpenID Connect Core 和 Discovery。
- PKCE，仅允许 `code_challenge_method=S256`。
- OAuth 2.0 Security Best Current Practice（RFC 9700）。
- OAuth Authorization Server Metadata（RFC 8414）。
- OAuth Authorization Server Issuer Identification（RFC 9207）。
- JWT Profile for OAuth 2.0 Access Tokens（RFC 9068）。
- OAuth Token Revocation（RFC 7009）和 Token Introspection（RFC 7662）。
- OpenID Connect RP-Initiated Logout。
- OpenID Connect Back-Channel Logout。

本方案不再以仍处于草案阶段的 OAuth 2.1 作为交付声明。

## 3. 用户流程

### 3.1 从统一门户进入应用

```text
用户登录 VentoStack
→ 打开 /app/portal
→ 门户展示当前用户可访问且已启用的 Application
→ 用户点击应用卡片
→ 浏览器进入 Application 首页 URL
→ Application BFF 创建 state、nonce 和 PKCE verifier/challenge
→ BFF 将浏览器重定向到 /api/oauth/authorize
→ 认证中心检测已有 SSO Session
→ 自动签发一次性 Authorization Code
→ 浏览器返回 Application Redirect URI
→ BFF 使用 Code + verifier + clientSecret 换取 Token
→ BFF 建立自己的本地 Session
```

门户不能自行构造授权请求。`state`、`nonce` 和 `code_verifier` 必须由子应用生成并绑定到其本地临时会话。

### 3.2 直接访问子应用

```text
用户访问 app.company.com/task/123
→ Application 发现没有本地 Session
→ Application 保存 /task/123 为登录后目标
→ Application 发起 OIDC Authorization Code + PKCE
→ 认证中心无 SSO Session时展示现有登录页
→ 用户完成密码、MFA 或 Passkey 登录
→ 认证中心返回一次性 Code
→ Application BFF 换取 Token并建立本地 Session
→ Application 返回 /task/123
```

原始业务路径由子应用通过自身 Session 或经过完整性保护的 `state` 保存。认证中心不接受任意外部 `returnUrl`。

### 3.3 后续访问其他应用

当浏览器已有认证中心 SSO Session 时，其他已授权 Application 发起 OIDC 登录后，认证中心直接完成授权，不再次要求用户输入凭据，也不显示同意页。

所有注册 Application 均是受平台管理的内部客户端，但仍处于不可信安全边界。用户可访问范围由管理员通过角色、部门和用户授权控制；客户端被攻陷或配置错误时，Scope、audience、租户和用户数据权限仍必须限制其能力。

## 4. Application 注册与管理

### 4.1 Application 字段

Application 是平台全局资源，不带 `tenant_id`。这是显式全局资源白名单；其可见授权关系仍属于具体租户。

| 字段 | 规则 |
|---|---|
| `id` | 服务端 UUID 主键；删除后作为 tombstone 保留 |
| `identifier` | 管理员填写的唯一业务标识符；创建后不可修改 |
| `name` | 应用名称，必填 |
| `description` | 应用描述，可选，限制长度 |
| `iconUrl` | 通过现有 OSS 上传获得的受控 URL |
| `homepageUrl` | 门户卡片进入地址，完整 URL |
| `redirectUri` | 单个完整精确回调地址 |
| `postLogoutRedirectUri` | RP-Initiated Logout 完成后的精确返回地址，可选 |
| `backchannelLogoutUri` | 接收 Back-Channel Logout Token 的地址，可选 |
| `backchannelLogoutSessionRequired` | 是否要求 Logout Token 携带 `sid`；本实现始终支持 |
| `enabled` | 是否允许门户展示和发起新授权 |
| `sort` | 门户排序，范围 `0—9999` |
| `clientId` | 服务端生成的不可变随机客户端标识 |
| `allowedScopes` | 该 Application 可以请求的 Scope 白名单 |
| `offlineAccessEnabled` | 平台管理员是否明确允许该客户端获得离线访问 |
| `status` | `ACTIVE`、`DISABLED`、`DELETING`、`DELETED` |
| `createdAt/updatedAt` | 审计时间 |

URL 规则：

- 生产环境只允许 HTTPS。
- 本地开发仅允许显式配置的 loopback HTTP 地址。
- Redirect URI 和 Post-Logout Redirect URI 必须完整精确匹配，不支持通配符、前缀匹配或动态拼接。
- Back-Channel Logout URI 必须是绝对 URI，不允许 fragment。

### 4.2 Client Secret

- 创建 Application 时生成 `clientSecret`，只展示一次。
- Secret 至少使用 256-bit CSPRNG 生成。数据库保存版本化、带服务端 pepper 的 HMAC-SHA-256 摘要，不保存明文或可逆密文；比较使用常量时间算法。
- 页面不提供再次查看 Secret 的能力。
- 忘记 Secret 时只能重新生成。
- 重新生成前必须二次确认，并明确提示旧 Secret 将立即失效。
- 不保留新旧 Secret 并行过渡期。
- Token、Revocation 和 Introspection 端点只接受 HTTP Basic `client_secret_basic`，不接受 query 或 `client_secret_post`。
- 客户端不存在与 Secret 错误必须执行统一的失败路径和响应，避免通过时序枚举 `clientId`；公开端点同时执行客户端级和全局限流。

### 4.3 启用与删除

- 禁用 Application 后：门户立即隐藏，新的授权请求、Code 交换和 Refresh Token 刷新均被拒绝。
- 管理端提供“永久删除”行为，数据库通过 tombstone 保留不可复用的 `identifier`、`clientId` 和最小审计字段，不真正移除唯一标识行。
- 删除使用 `ACTIVE/DISABLED → DELETING → DELETED` 状态机。进入 `DELETING` 的同一事务先阻止新的授权、换码和刷新，撤销 Authorization Code、Refresh Token 和客户端 Session，并写入 Logout Outbox。
- Back-Channel Logout 由持久化 Outbox 异步投递；网络调用不得放在删除数据库事务中。
- 完成运行态撤销后清理角色/部门/用户授权、Application 菜单、Secret、URI 和 Icon 引用，再转为 `DELETED`。
- OAuth 认证日志保留，不随 Application 删除；日志保存 `clientId`、应用名称和标识符快照。
- tombstone 上的唯一约束保证 `clientId` 和 `identifier` 永不复用。
- 删除 Application 记录时只删除 Icon 数据库引用，不自动删除 OSS 对象，避免误删复用资源。

### 4.4 平台控制面权限

全局 Application 配置与租户授权采用两层权限：

- 菜单—角色—权限决定页面与操作入口。
- Application 创建、Redirect/Logout URI、allowedScopes、Secret、启停和删除属于全局认证控制面；服务端必须在每次读写时从数据库实时确认操作者的平台管理员身份，不能只信 JWT 角色快照。
- 租户管理员只能读可供当前租户授权的 Application，并管理当前可信 `tenant_id` 下的角色、用户和部门 grants；不能修改全局客户端配置。
- 全局配置 API 与租户 grants API 使用不同权限标识、服务方法和审计事件。
- 当前部署若只有一个业务租户，也保持上述边界，避免未来启用多租户时改变安全语义。

## 5. Application 可见授权

### 5.1 授权主体

Application 表单可选择：

- 角色。
- 指定用户。
- 部门。

角色、用户和部门授权取并集。没有任何授权时默认无人可访问。

授权关系必须带由认证上下文注入的 `tenant_id`。Application 虽然是全局资源，但某租户的角色、部门和用户授权不能影响其他租户；请求体、Query、Path 和 Header 均不得指定或覆盖租户。

角色、用户、部门分别使用三张关联表，以 `(tenant_id, subject_id)` 复合外键保证引用完整性。授权表单保存采用全量覆盖事务：先校验主体存在、启用且属于当前租户，再批量替换，不允许非事务的先删后逐条插入。

### 5.2 部门授权范围

每条部门授权必须选择：

- `SELF`：仅本部门。
- `SELF_AND_DESCENDANTS`：本部门及所有有效子部门。

部门树和用户主部门变化后实时生效。解析失败时 fail-closed，不回退到全租户可见。

### 5.3 权限检查位置

- 门户列表只返回当前用户有权访问的启用 Application。
- `/authorize` 必须再次校验可见授权，不能信任门户结果。
- 被禁用、删除、跨租户、用户失效或授权已移除时统一拒绝新授权。
- 跨租户资源不可见，响应不得泄露 Application 在其他租户中的授权情况。

## 6. Application 菜单与身份上下文

### 6.1 菜单模型

扩展现有 `sys_menu`：

- 新增可空 `application_id`。
- `application_id IS NULL` 表示当前 VentoStack 管理后台菜单。
- 有值时表示对应子应用的菜单和权限。
- Application 菜单仍属于租户，保留 `tenant_id`。
- 父子菜单必须属于同一 `tenant_id` 和同一 Application；禁止后台菜单与子应用菜单交叉挂载。
- Admin 菜单树、Admin 权限加载器、角色菜单分配和默认菜单 CRUD 必须显式限定 `application_id IS NULL`，不能读取 Application 菜单。
- OAuth Context 菜单、权限和角色菜单分配必须显式限定 `application_id = 当前客户端对应 Application ID`。
- 创建、移动或修改菜单归属时，服务层与数据库约束共同保证父子 `(tenant_id, application_id)` 一致；需要专门处理 `NULL` 表示 Admin 菜单的约束语义。

菜单管理页增加 Application 归属选择与筛选。现有平台菜单的默认行为保持不变。

### 6.2 身份上下文接口

```http
GET /api/oauth/me/context
Authorization: Bearer <access_token>
```

响应结构：

```json
{
  "user": {
    "id": "10001",
    "username": "zhangsan",
    "displayName": "张三",
    "avatar": null
  },
  "application": {
    "id": "reconcile",
    "name": "智能对账",
    "icon": "https://auth.company.com/uploads/apps/reconcile.png"
  },
  "roles": [],
  "permissions": [],
  "menus": [],
  "departments": []
}
```

约束：

- 不返回 `organization` 字段。
- `departments` 返回用户当前有效主部门及其有效上级链。
- `roles` 来自当前租户内实时有效角色。
- `menus` 和 `permissions` 只返回当前 Access Token 对应 Application 的菜单子树与权限。
- 子应用不能通过参数指定 Application；Application 由已验证 Access Token 的 `client_id` 确定。Access Token 的 `aud` 标识资源服务器，不能用作客户端标识。
- 用户状态、租户归属、Session 和 Application 授权必须实时校验。
- UserInfo 和 ID Token 的 `sub` 必须完全一致。首期 `sub` 使用 issuer 内稳定且不可重分配的用户主体标识；若未来跨客户端关联风险需要隔离，再引入 pairwise subject 迁移方案。
- 标准 claims 映射：`preferred_username ← username`、`name ← nickname`、`picture ← avatar`。首期不声明未实现的 `email`、`phone` Scope 或 claims。
- `/me/context` 缺少 `context` 时返回 403 `insufficient_scope`；已有 `context` 但缺少字段 Scope 时省略对应字段，不用空数组伪装已授权的空数据。

## 7. Scope 模型

### 7.1 核心 Scope

平台固定注册：

- `openid`
- `profile`
- `offline_access`
- `context`

`openid` 是 OIDC 请求必需 Scope。`context` 控制是否允许访问 `/api/oauth/me/context`。

`offline_access` 仅对包含 `openid` 且使用 Authorization Code Flow 的请求生效。首期不实现用户同意页，因此只有平台管理员已为 Application 明确设置 `offlineAccessEnabled=true`，且部署方确认存在允许该内部客户端执行离线处理的治理与合法条件时才处理该 Scope；否则忽略 `offline_access` 且不签发 Refresh Token。未来引入用户 consent 后按 OIDC Core 处理 `prompt=consent`。

### 7.2 资源 Scope

资源 Scope 必须由平台白名单注册，Application 只能勾选已注册 Scope，不能自由输入未实现字符串。

首期实现：

- `roles.read`
- `departments.read`
- `permissions.read`
- `menus.read`

字段级返回规则：

| 数据 | 所需 Scope |
|---|---|
| 用户标准身份字段 | `profile` |
| Application 上下文 | `context` |
| 角色 | `roles.read` |
| 部门 | `departments.read` |
| 权限 | `permissions.read` |
| 菜单 | `menus.read` |

Authorization Request 中的全部 Scope 必须同时属于平台已注册 Scope 和 Application `allowedScopes`。出现任意未注册或未允许 Scope 时，整个授权请求返回 `invalid_scope`，不得静默删除。最终签发 Scope 等于经验证的请求 Scope。

Refresh 请求省略 `scope` 时沿用原授权 Scope；提供 `scope` 时只能请求原授权 Scope 的子集，否则返回 `invalid_scope`。Refresh Token、后继 Access Token 的 resource audience 也不得扩大。

首期不新增用户、部门、角色或权限目录列表 API。`users.read` 等目录 Scope 等对应资源 API 实际存在后再注册，避免出现可配置但无行为的 Scope。

### 7.3 后续业务 API 接入原则

OAuth 模块不代理其他业务模块的 API。

以后某个原生业务接口需要开放给第三方 Application 时，应在资源所属模块：

1. 显式声明允许 OAuth Access Token。
2. 声明所需 Scope。
3. 验证 Token issuer、audience、签名、过期时间和 Session 状态。
4. 继续叠加用户的租户、角色、权限和数据范围。

未显式声明的现有 `/api/system/**` 管理接口继续只接受原后台认证，不得因为引入 OAuth 模块而自动对第三方开放。

## 8. 对外 API

OAuth/OIDC 协议、管理、门户和上下文 API 统一使用 `/api/oauth` 前缀。登录页面等浏览器 UI 路由不属于 API 前缀约束。RFC 8414 规定的标准 metadata 地址是唯一的路径例外。

### 8.1 Discovery 与协议端点

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/oauth/.well-known/openid-configuration` | OIDC Discovery |
| GET | `/.well-known/oauth-authorization-server/api/oauth` | RFC 8414 Authorization Server Metadata |
| GET | `/api/oauth/jwks` | RS256 公钥集合 |
| GET | `/api/oauth/authorize` | Authorization Endpoint |
| POST | `/api/oauth/token` | Code/Refresh Token 交换 |
| POST | `/api/oauth/revoke` | Token Revocation |
| POST | `/api/oauth/introspect` | Token Introspection |
| GET/POST | `/api/oauth/userinfo` | OIDC UserInfo |
| GET/POST | `/api/oauth/logout` | RP-Initiated Logout |
| GET | `/api/oauth/me/context` | Application 身份上下文 |

Issuer 固定为配置的认证中心公开地址加 `/api/oauth`，不得包含 query 或 fragment。OIDC Discovery 使用 issuer 后追加路径；RFC 8414 metadata 使用其规定的 path insertion 地址。两份 metadata 的 `issuer`、Token `iss` 和客户端配置必须逐字节一致。生产环境禁止从不可信 Host 或 Forwarded Header 动态推断 issuer。

两份 metadata 至少发布：`issuer`、`authorization_endpoint`、`token_endpoint`、`jwks_uri`、`userinfo_endpoint`、`revocation_endpoint`、`introspection_endpoint`、`end_session_endpoint`、`scopes_supported`、`response_types_supported:["code"]`、`grant_types_supported:["authorization_code","refresh_token"]`、`subject_types_supported`、`id_token_signing_alg_values_supported:["RS256"]`、三个端点的 `client_secret_basic` 认证方法、`code_challenge_methods_supported:["S256"]`、`authorization_response_iss_parameter_supported:true`、`backchannel_logout_supported:true` 和 `backchannel_logout_session_supported:true`。

### 8.2 Application 管理

| 方法 | 路径 | 权限示例 |
|---|---|---|
| GET | `/api/oauth/applications` | `oauth:application:list` |
| POST | `/api/oauth/applications` | `oauth:application:create` |
| GET | `/api/oauth/applications/:id` | `oauth:application:query` |
| PUT | `/api/oauth/applications/:id` | `oauth:application:update` |
| DELETE | `/api/oauth/applications/:id` | `oauth:application:delete` |
| POST | `/api/oauth/applications/:id/secret/regenerate` | `oauth:application:secret` |
| POST | `/api/oauth/applications/:id/icon` | `oauth:application:update` |
| GET/PUT | `/api/oauth/applications/:id/grants` | `oauth:grant:list/update` |

菜单权限控制入口和动作；全局 Application 的创建、修改、删除、Secret 再生成和 Icon 变更还必须经过数据库实时平台管理员守卫。Grants 接口只允许管理当前认证租户，并执行同租户主体、数据范围和事务替换校验。

### 8.3 门户与日志

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/oauth/portal/applications` | 当前用户可访问的启用 Application |
| GET | `/api/oauth/logs` | OAuth 日志分页与筛选；租户管理员仅看本租户，平台管理员可跨租户 |

## 9. Authorization Code 与 Token

### 9.1 Authorization Request

`/authorize` 必须验证：

- `response_type=code`。
- 有效且启用的 `client_id`。
- 完整精确匹配的 `redirect_uri`。
- 至少 128-bit CSPRNG 生成的非空 `state`。
- OIDC 请求的 `nonce`。
- `code_challenge`。
- `code_challenge_method=S256`。
- 请求 Scope 全部已注册且属于 Application 允许范围；否则返回 `invalid_scope`。
- 当前用户仍可访问该 Application。

无 SSO Session 时，服务端在共享短期存储中创建一次性 `oauth_authorization_request`，绑定 issuer、client、redirect URI、state 摘要、nonce、PKCE challenge、Scope 和浏览器临时会话，再跳转现有登录页。登录完成后只能原子恢复并消费该事务，禁止直接信任浏览器传回的外部 URL。

授权成功和标准错误响应均返回 RFC 9207 `iss`；Redirect URI 已验证时原样返回 `state`。无法确认 `client_id` 或 Redirect URI 时不得重定向。BFF 回调必须先常量时间校验并原子消费本地 state，再校验 `iss`，最后换取 Code。

### 9.2 Authorization Code

- 密码学安全随机值。
- 数据库或 Redis 只保存哈希。
- 默认有效期 60 秒。
- 只能使用一次。
- 绑定 `client_id`、`redirect_uri`、用户、租户、中心 Session、nonce、Scope 和 PKCE challenge。
- Token Endpoint 使用单事务或原子条件更新消费 Code，并联合校验已认证 `client_id`、原始 `redirect_uri`、Code 状态和 PKCE verifier；同一 Code 并发兑换只能一次成功。
- `code_verifier` 必须为 43—128 个 RFC 3986 unreserved 字符；S256 challenge 为 `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))` 且不含 `=` padding。
- Code 交换成功或发生重放后立即失效；缺失、非法或不匹配的 verifier 统一返回 `invalid_grant`。

### 9.3 Token

- Token Endpoint 只接受 HTTPS POST 和 `application/x-www-form-urlencoded`。
- Code 交换必须包含 `grant_type=authorization_code`、`code`、原始 `redirect_uri` 和 `code_verifier`。
- Refresh 必须包含 `grant_type=refresh_token` 和 `refresh_token`；可选 `scope` 只能缩小原授权。
- 客户端认证失败返回 HTTP 401 与 `invalid_client`；其他错误按 RFC 6749 JSON 格式返回。
- 成功响应包含 `token_type=Bearer`、`access_token`、`expires_in`、`scope`、`id_token`，获准离线访问时再包含 `refresh_token`。
- ID Token：RS256 JWT。
- Access Token：RS256 JWT，默认有效期 15 分钟。
- Refresh Token：不透明随机值，默认有效期 7 天，仅在授权包含 `offline_access` 时签发。
- Refresh Token 保存 `family_id`、`parent_id`、`used_at`、`replaced_by`、client、tenant、session、Scope 和 resource audience；使用事务或 CAS 强制轮换，只有一个并发请求能成功。
- 首期不设置 Refresh 重试 grace。检测到已使用 Token 重放时撤销该客户端的整个 Token Family 和客户端 Session并记录高风险事件；不直接销毁其他客户端共用的中心 SSO Session，是否升级为全局退出交由风险策略决定。

ID Token 至少包含：

- `iss`
- `sub`
- `aud`
- `iat`
- `exp`
- `sid`
- `nonce`

ID Token 的 `aud` 必须包含请求方 `client_id`；存在多个 audience 时按 OIDC Core 处理并校验 `azp`。RP 必须校验固定算法、签名、`iss`、`aud`、适用时的 `azp`、`exp`、`iat` 和与本地授权事务绑定的 `nonce`。发生认证时记录 `auth_time`，并用 `amr` 表示 password、MFA 或 Passkey；需要认证强度策略时再引入受控 `acr` 值。

Access Token 使用 RFC 9068 风格的 `typ=at+jwt`，至少包含 `iss`、`sub`、`aud`、`client_id`、`sid`、`tenant_id`、`scope`、`iat`、`exp` 和 `jti`。`aud` 必须标识实际资源服务器，例如 Context Resource Server，不能用 OAuth `client_id` 代替。验证端固定允许 `alg=RS256`，仅根据可信 issuer 配置和本地/JWKS `kid` 选键，忽略并拒绝 Token Header 中的远程 `jku/x5u`。

ID Token 不包含业务角色、菜单和权限，不得用于调用资源 API。UserInfo 返回的 `sub` 必须与 ID Token 完全一致。

### 9.4 Revocation

- 只接受 HTTPS POST 和 `application/x-www-form-urlencoded`；请求包含必需的 `token` 与可选的 `token_type_hint`。
- 使用 `client_secret_basic`，只能撤销属于已认证客户端的 Token。
- Token 不存在、已失效、已撤销或不属于该客户端时均返回 HTTP 200 空响应，不泄露状态或归属。
- 撤销 Refresh Token 时撤销同一客户端授权链及由其派生且仍可追踪的 Access Token JTI。
- 未识别的 `token_type_hint` 不影响 Token 查找；仅在 Token 类型本身不受支持时返回 `unsupported_token_type`。

### 9.5 Introspection

- 只接受 HTTPS POST 和 `application/x-www-form-urlencoded`；请求包含必需的 `token` 与可选的 `token_type_hint`。
- 调用方使用 `client_secret_basic`；认证失败返回 HTTP 401 与 `invalid_client`。
- 客户端只能查询发给自己的 Token。已认证但 Token 不存在、失效、撤销或无权查看时统一返回 HTTP 200 和 `{"active":false}`，不得返回其他字段或失败原因。
- 活跃 Token 按最小披露原则返回适用的 `scope`、`client_id`、`sub`、`aud`、`iss`、`exp`、`iat`、`jti` 和 `token_type`。
- `active` 同时取决于固定算法与签名、Token 用途、过期与撤销状态、Session、用户、租户、Application 状态和 resource audience。
- 高风险子应用请求可以调用 Introspection 实现即时撤销；普通请求可以通过 JWKS 本地验签。

## 10. SSO Session 与 Cookie

- 认证中心负责独立 SSO Session。
- 密码、MFA 和 Passkey 复用现有底层凭证验证能力，但 OAuth 登录不能直接复用会同时签发后台 HMAC Token 的 `AuthSessionManager.login()`；认证主体确认与后台/OAuth Session 签发必须拆分。
- 从 `/authorize` 进入登录时，密码、MFA 或 Passkey 完成后创建或旋转 SSO Session，并原子恢复服务端 `oauth_authorization_request`。普通后台登录是否同时创建 SSO Session，由统一登录编排层明确执行，不能靠浏览器已有后台 Access Token 推断。
- SSO Session 使用独立 Cookie 名、Redis key namespace、TTL 和共享存储，不与后台 Session ID 或 OAuth Client Session 混用。
- SSO Cookie 使用随机不透明 Session ID，不直接承载用户资料或 OAuth Token。名称使用 `__Host-vs_sso`，不得设置 Domain，也不得从 URL 或 Header 接受 Session ID。
- Cookie 属性：`HttpOnly; Secure; SameSite=Lax; Path=/`，并设置明确的 idle timeout 与 absolute timeout。
- 使用 `SameSite=Lax` 是为了让用户从外部子应用顶层导航到认证中心时携带 SSO Session。
- 登录、MFA、Passkey 和权限提升完成后必须旋转 Session ID并原子废弃旧 ID，防止 Session Fixation。
- 后台退出只销毁后台会话；RP-Initiated/门户全局退出销毁 SSO Session 与相关 OAuth Client Session；密码安全事件和管理员 forceLogout 同时销毁后台与 SSO Session。上述事件统一进入会话失效服务，不能由路由各自实现。
- 用户禁用、拉黑、租户失效、密码安全事件、强制退出或 Session 删除后，OAuth 授权和上下文检查立即失败。
- 多实例生产部署必须使用共享 Session、授权码和撤销存储；不得静默回退到进程内内存存储。

## 11. 全局退出

### 11.1 RP-Initiated Logout

子应用可以通过 Discovery 中的 `end_session_endpoint` 发起全局退出。GET 只解析请求并展示确认页面；实际状态变更使用带一次性 Logout Transaction 和 CSRF 防护的 POST。

- 支持 `id_token_hint`、`logout_hint`、`client_id`、`post_logout_redirect_uri`、`state` 和 `ui_locales`。同时提供 `client_id` 和 `id_token_hint` 时二者必须匹配。
- 校验 `id_token_hint` 属于当前或近期 issuer、client、用户和 SSO Session；已过期 hint 仍需通过签名、issuer、audience 和 Session 关联校验。
- `post_logout_redirect_uri` 必须与 Application 注册值精确匹配。
- 缺少、无法验证或未绑定当前浏览器 Logout Transaction 的 hint 必须要求用户确认，不能静默销毁任意 Session。
- 执行回跳时原样返回 `state`；请求校验失败时不得执行 RP 回跳。
- 完成后销毁中心 Session、撤销相关 Refresh Token，并清理中心 Cookie。

### 11.2 Back-Channel Logout

- 认证中心跟踪某个 SSO Session 已登录过的 Application。
- 全局退出时向这些 Application 的 `backchannelLogoutUri` 发送 HTTP POST。
- 请求体使用 `application/x-www-form-urlencoded`，包含签名的 `logout_token`。
- Logout Token 使用 `typ=logout+jwt` 和 RS256，包含 `iss`、`aud`、`iat`、`exp`、`jti`、`sid` 和标准 back-channel logout event，不包含 `nonce`。
- 注册/更新和每次连接都执行 URL、DNS、解析后 IP、端口与 TLS hostname 策略；使用独立 egress/NetworkPolicy，阻止 metadata、link-local、loopback 和未经批准的私网目标，连接绑定已验证地址，禁止代理环境变量绕过。
- 请求禁止跟随重定向，设置短超时和响应大小上限。
- 失败写入持久化 Outbox并有限重试；不能因为单个 Application 不可达而恢复中心 Session。
- 全局退出只承诺中心 Session 与 Token 立即失效。可达 BFF 收到有效 Logout Token 后清除本地 Session；不可达 BFF 进入可审计重试。需要即时阻断的子应用高风险请求必须调用 Introspection。

## 12. 签名密钥

- 使用独立于现有后台 HMAC JWT Secret 的 OAuth/OIDC RS256 密钥。
- 生产环境从环境变量或外部 Secret 管理系统注入当前私钥和历史公钥集合。
- 每把密钥必须有唯一 `kid`。
- 密钥状态为 `PREPUBLISHED → ACTIVE → RETIRED → REMOVED`。新公钥先发布至少一个 JWKS cache 窗口，再由单一权威配置原子切换为 ACTIVE。
- 新 Token 只使用 ACTIVE 私钥签名；RETIRED 公钥至少保留最长 Token 生命周期、允许时钟偏差和 JWKS cache 窗口之和。
- JWKS 返回明确的 `Cache-Control` 和 `ETag`；客户端遇到未知 `kid` 时只能受限刷新，避免请求放大。
- 建立私钥泄露应急流程，支持切换密钥、撤销 Token Family/Session 和强制客户端刷新 JWKS；多实例不得各自选择不同 ACTIVE `kid`。
- 生产环境缺少 issuer、当前私钥、`kid` 或共享存储配置时必须启动失败。
- 私钥不得进入数据库、日志、OpenAPI、前端构建产物或错误响应。

建议新增配置：

- `OAUTH_ISSUER`
- `OAUTH_SIGNING_KEY_ID`
- `OAUTH_SIGNING_PRIVATE_KEY`
- `OAUTH_VERIFYING_JWKS`
- `OAUTH_ACCESS_TOKEN_TTL_SECONDS`
- `OAUTH_REFRESH_TOKEN_TTL_SECONDS`
- `OAUTH_AUTHORIZATION_CODE_TTL_SECONDS`
- `OAUTH_ALLOWED_LOOPBACK_REDIRECTS`

## 13. 数据模型

建议最小数据集合：

- `oauth_application`：Application 基本信息和客户端配置。
- `oauth_client_secret`：当前 Secret 哈希、创建时间和状态。
- `oauth_application_role_grant`：租户、Application 与角色的复合关联。
- `oauth_application_user_grant`：租户、Application 与用户的复合关联。
- `oauth_application_dept_grant`：租户、Application、部门与 `SELF/SELF_AND_DESCENDANTS`。
- `oauth_authorization_request`：登录前经过验证的一次性授权事务，使用共享短期存储。
- `oauth_authorization_code`：一次性 Code 哈希和绑定信息。
- `oauth_refresh_token`：Refresh Token 哈希、family lineage、轮换和撤销状态。
- `oauth_client_session`：SSO Session 与已登录客户端的关系，用于全局退出。
- `oauth_logout_outbox`：Back-Channel Logout 持久化投递、重试和终态。
- `oauth_auth_log`：独立 OAuth 认证日志表。
- `sys_menu.application_id`：Application 菜单归属。

数据库约束：

- Application `identifier` 和 `client_id` 全局唯一。
- `DELETED` tombstone 继续参与 `identifier` 和 `client_id` 唯一约束。
- 三类授权关系必须包含 `tenant_id`，以复合外键和唯一约束保证主体同租户且不重复。
- 租户资源关联必须使用包含 `tenant_id` 的约束或在单次受限查询中校验两端归属。
- Code、Refresh Token 和 Secret 只存哈希。
- Refresh Token family 更新、Code 消费和状态机迁移使用条件更新并检查 affected rows。
- 删除 Application 时清理运行态凭证和授权关系并保留 tombstone；OAuth 日志不建立级联删除。
- 迁移必须注册到 Admin API 的统一迁移入口。

## 14. OAuth 认证日志

OAuth 日志使用主数据库中的独立 `oauth_auth_log` 表，与 `sys_login_log` 和通用操作日志隔离。管理后台现有日志页面新增“OAuth 日志”Tab。

- 租户管理员只能查询当前认证租户日志；平台管理员经过数据库实时守卫后可跨租户查询。
- 列表、详情和未来导出使用相同租户过滤，不提供普通租户角色清空审计日志的能力。
- 配置保留期、归档任务、分页上限和清理审计；日志表及任务按租户 namespace 处理。
- 协议成功不依赖普通查询页面可用，但安全事件不得静默丢失；写入失败进入有界可靠缓冲并触发健康告警，缓冲耗尽时高风险控制面操作 fail-closed。

记录事件：

- 登录成功、登录失败。
- 已有 SSO Session 自动登录。
- Authorization Code 签发、交换成功和失败。
- Token 刷新和 Refresh Token 重放。
- Token 撤销。
- Introspection 成功和失败。
- 用户退出和全局退出。
- Session 强制失效。
- 非法 Redirect URI。
- 认证中心可观察到的 Token 校验失败。
- Application 客户端认证失败。
- Back-Channel Logout 成功、失败和重试。

日志只保存：

- 事件类型、结果和稳定原因码。
- 用户、租户、`clientId`、Application 名称与标识符快照。
- 可信客户端 IP、User-Agent 摘要、请求 ID 和时间。
- 不敏感的参数摘要与耗时。

禁止保存 Authorization Code、Access Token、Refresh Token、ID Token、clientSecret、Cookie、Authorization Header、PKCE verifier 或完整请求体。

子应用本地 JWKS 验签失败由子应用记录。认证中心只记录自身端点实际观察到的校验事件。

## 15. 管理端页面

### 15.1 Application 管理

路由建议：`/app/oauth/applications`。

能力：

- 列表、搜索、启用/禁用、排序和管理端“永久删除”（数据库保留不可恢复 tombstone）。
- 创建和编辑基本信息。
- Icon 上传。
- 查看 `clientId`。
- 创建完成后一次性展示 `clientSecret` 并提供复制操作。
- 二次确认后重新生成 Secret。
- 配置允许 Scope。
- 在 Application 表单内配置角色、用户和部门授权。
- 部门授权逐项选择“本部门”或“本部门及子部门”。

### 15.2 应用门户

路由：`/app/portal`。

- 保留现有 `/app` 管理首页，不用门户替换仪表盘。
- 展示当前用户可访问、已启用的 Application 卡片。
- 支持名称搜索和管理员配置顺序。
- 展示 Icon、名称和描述。
- 首期不做应用分类和最近使用。
- 点击卡片进入 `homepageUrl`，由 Application 发起 OIDC。
- 复用现有个人中心、修改密码和退出登录入口。

### 15.3 OAuth 日志

- 放入现有系统日志页面，新增独立 OAuth 日志 Tab。
- 支持按事件类型、Application、用户、结果和时间范围筛选。
- 日志详情不展示任何凭证或敏感载荷。

## 16. 错误与安全规则

- `/authorize` 对已验证 Redirect URI 返回标准 OAuth/OIDC 错误；Redirect URI 本身不合法时不得重定向到该地址。
- Code、Token、Introspection 和 Revocation 端点使用标准错误码，并避免泄露 Application、用户或 Secret 是否存在。
- 管理 API 和业务 JSON 输入使用严格 Schema并拒绝未知字段。OAuth/OIDC 协议端点按规范忽略未识别扩展参数，但拒绝同名参数重复、参数为空、格式非法或单次请求出现多种客户端认证方式；所有已识别参数仍限制长度、字符集和数量。
- 所有数据库查询参数化。
- Rate Limit 至少覆盖登录、Authorize、Token、Refresh、Introspection、Secret 再生成和 Logout。
- 所有使用后台 Cookie 的管理写接口使用现有 CSRF 中间件并校验 Origin；Secret 再生成、全局配置和删除要求近期重新认证。
- 不信任客户端传入的 `tenantId`、用户 ID、Application ID 或 Scope 结果。
- 不从未配置的代理头推断真实 IP、HTTPS 或 issuer。
- Back-Channel Logout 防止 SSRF：执行注册时和连接时双重 URL/DNS/IP 策略、出站网络限制、禁止重定向、限制协议、端口、超时和响应大小，并记录失败。
- Access Token 必须校验 `iss`、`aud`、`exp`、签名、用途和 Scope；ID Token 不能用于调用资源 API。
- 任意关键依赖不可用时 fail-closed，不允许回退到无 Session、无租户或无权限校验模式。
- Homepage 在门户中显示目标域并受允许域策略约束；Icon 只保存现有 OSS 返回的对象标识，限制 MIME、大小和尺寸，SVG 等主动内容需转码或从隔离资源域提供。

## 17. 测试与验收

### 17.1 单元测试

- PKCE S256 正确与错误 verifier。
- Code 一次性、超时、client/redirect/session 绑定和重放。
- clientSecret 只存哈希、创建展示一次和重新生成后旧 Secret 立即失效。
- Scope 注册、Application 白名单、非法 Scope 返回 `invalid_scope` 和 Refresh 仅缩小 Scope。
- RS256 签发、JWKS、`kid` 和历史公钥验证。
- ID Token/Access Token audience、claims、`typ` 和用途隔离。
- Refresh Token 原子轮换、并发竞争、family 撤销和重放检测。
- Redirect URI 和 Post-Logout Redirect URI 精确匹配。
- Application 字段级上下文 Scope。
- 角色、用户、部门及部门后代授权。
- Admin 菜单 `application_id IS NULL` 与 Application 菜单隔离。
- Application 删除状态机、tombstone 与 Outbox 重试。

### 17.2 HTTP 集成测试

- 无 SSO Session 的完整登录、MFA/Passkey 和授权恢复。
- 已有 SSO Session 的静默授权。
- 从子应用深层链接发起登录并返回原路径。
- Token、Refresh、Revoke、Introspect、UserInfo 和 Context。
- OIDC Discovery 和 RFC 8414 Metadata 由成熟客户端根据 issuer 自动发现，不允许测试手填端点绕过发现流程。
- Revocation 对未知、失效和非当前客户端 Token 返回一致 HTTP 200；Introspection 对无权或无效 Token 返回一致 `active:false`。
- 禁用或删除 Application 后拒绝授权和刷新。
- RP-Initiated Logout 和 Back-Channel Logout。
- 同租户成功、跨租户不可见、缺失或失效租户 fail-closed。
- Application 菜单隔离和实时角色/权限变化。

### 17.3 安全回归

- 开放重定向、URI 编码差异、fragment 和通配绕过。
- Code 重放、PKCE downgrade、错误 audience、错误 issuer 和 Token 类型混用。
- state/nonce/授权事务重放、缺失或错误响应 `iss`、并行登录事务串线。
- Refresh Token 重放和并发刷新。
- 未授权 Scope、已移除授权、停用用户和强制失效 Session。
- Back-Channel SSRF、重定向和超时。
- DNS rebinding、IPv4/IPv6 非标准编码、metadata/link-local 地址和代理环境变量绕过。
- Cookie tossing、Session Fixation、Logout CSRF 和管理写接口 CSRF。
- 日志、错误响应和 OpenAPI 不泄露凭证。

### 17.4 真实互操作与浏览器验证

建立一个真实 BFF 测试客户端，验证：

1. 首次访问子应用完成中心登录并建立本地 Session。
2. 第二个 Application 复用 SSO Session，无需再次输入密码。
3. 浏览器 URL、Local Storage 和 Session Storage 中不存在 OAuth Token。
4. `/me/context` 只返回对应 Application、Scope 和当前用户权限允许的数据。
5. 全局退出后中心 Session 和相关 Refresh Token 立即失效；可达 BFF 清除本地 Session，不可达 BFF 进入可审计重试，并由 Introspection 阻断高风险请求。
6. 管理页面完成注册、Secret 一次性展示、Icon 上传、授权、门户展示和日志查询。

## 18. 实施顺序

1. 建立 `packages/platform/oauth` 骨架、配置、模型、迁移和 boot 装配。
2. 实现 RS256 密钥环、Discovery、JWKS、Application 与 Secret 管理。
3. 实现 SSO Session、Authorize、Code、PKCE、Token、Refresh、Revoke 和 Introspection。
4. 实现 Application 可见授权、菜单归属、UserInfo 和 `/me/context`。
5. 实现 RP-Initiated Logout、Back-Channel Logout 和 OAuth 日志。
6. 实现 Admin Application 管理、门户和日志 Tab。
7. 完成真实 BFF 接入样例、浏览器验证、中文文档和安全审查。

## 19. 明确不在首期范围

- OAuth 2.1 交付声明。
- SPA public client、移动端或桌面原生客户端。
- Implicit、Password、Device Authorization 或 Client Credentials Grant。
- 动态客户端注册。
- 用户授权同意页和用户级 consent 持久化。
- 应用分类和最近使用。
- 用户、部门、角色、权限的第三方目录列表 API。
- 自动代理或自动开放现有 `/api/system/**` 管理接口。
- `private_key_jwt`、mTLS、DPoP 和 PAR。

## 20. 最终设计默认值与部署确认项

以下技术边界已经由本规格锁定：平台管理员控制全局 Application、租户管理员控制本租户 grants、OIDC 与 RFC 8414 双 metadata、ID/Access Token 分离、tombstone 删除、原子 Token Family、独立 SSO Session 和可靠 Logout Outbox。

部署到具体环境前，业务负责人仍需确认以下产品参数；这些参数不会改变协议架构：

1. `sys_menu.application_id` 是否足以表达子应用菜单，是否存在一个菜单需归属多个 Application 的业务需求。
2. 首期 Scope 与 `/me/context` 字段映射是否满足现有子应用。
3. Access Token 15 分钟、Refresh Token 7 天、Code 60 秒以及 SSO idle/absolute TTL 的具体值。
4. Secret 立即轮换产生的短时中断是否符合发布流程。
5. Back-Channel Logout 允许访问的域名、CIDR、端口和重试上限。
6. 环境密钥环是否与现有 Secret 管理和多实例部署方式兼容。

## 21. 实施与验证记录

当前实现已经落入 `packages/platform/oauth`，并接入 platform boot、Admin API、Admin Web、数据库迁移和中文文档。实现包含 Application/Secret 管理、租户授权、应用菜单、门户、认证日志、Discovery、JWKS、Authorization Code + PKCE、Token/Refresh/Revoke/Introspect、UserInfo、`/me/context`、RP-Initiated Logout、Back-Channel Logout Outbox 和 BFF 示例。

已验证：OAuth 聚焦测试、仓库全量 Bun 测试、Admin API TypeScript、Admin Web 生产构建、BFF TypeScript，以及 PostgreSQL 16 上的完整 Admin 迁移链。文档站本地构建当前受既有 `@ventostack/file-parser-darwin-arm64` 原生二进制被 Vite 当作 JavaScript 解析的问题阻塞；知识库生成、内容同步和 Astro 类型生成已经完成，该问题不来自 OAuth 文档。

运行边界：Back-Channel Logout 的应用层检查不能替代部署网络出口策略；生产环境必须配置独立 NetworkPolicy 或等价 egress allowlist。仓库提供可运行 BFF，但真实多应用浏览器互操作仍需要部署环境的域名、TLS、RSA 密钥、共享 PostgreSQL/Redis 和两个实际客户端配置后执行。
