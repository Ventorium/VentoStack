# OAuth BFF Example

开发用 confidential BFF 示例。它通过 Discovery 获取端点，使用 Authorization Code + PKCE，后端校验 ID Token，并把 Token 保存在服务端内存 Session 中。

```bash
OAUTH_ISSUER=http://localhost:9320/api/oauth \
OAUTH_CLIENT_ID=vs_xxx \
OAUTH_CLIENT_SECRET=xxx \
bun run --cwd apps/oauth-bff-example dev
```

可选：

- `OAUTH_SCOPES`：请求的 Scope，默认 `openid profile context offline_access`。需要角色、部门、权限或菜单字段时追加 `roles.read departments.read permissions.read menus.read`（这些 Scope 必须同时在该 Application 的 `allowedScopes` 内）。
- `OAUTH_REDIRECT_URI`：默认 `http://127.0.0.1:9400/callback`。
- `PORT`：默认 `9400`。

在认证中心注册回调 `http://127.0.0.1:9400/callback`，并在本地开发配置中允许 loopback HTTP。示例的内存 Session 仅用于互操作测试，生产子应用应使用共享 Session 存储并给 Cookie 增加 `Secure`。

Back-Channel Logout 无法用本示例在本地端到端验证：认证中心按 SSRF 策略要求回调地址是无端口、无凭据的 HTTPS URL，且禁止指向 loopback、link-local 与私网地址。该路径由单元测试覆盖，真实验证需要公网 HTTPS 域名。

