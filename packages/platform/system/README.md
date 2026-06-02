# @ventostack/system

用户、角色、菜单、部门、岗位、字典、配置、公告、操作日志。

## 模块定位

系统管理业务模块，依赖 core、database、cache、auth、observability、events。提供 RBAC 权限、用户管理、系统配置等后台管理能力。

## 安全特性

### 权限中间件模式

所有非公开 API 必须绑定认证中间件 + 权限标识符：

```typescript
const perm = createPermMiddleware(rbac);
router.post("/api/system/users", perm("system:user:create"), handler);
```

- 超管角色（`admin`）跳过权限检查
- 禁止在 `module.ts` 中内联 `(ctx: any, next: any)` 权限中间件

### 操作日志

`createOperationLogMiddleware` 自动记录写操作：

- **自动脱敏**：请求体中 31 个敏感字段（password、token、secret、mfaSecret 等）递归替换为 `"******"`
- **可信代理 IP 校验**：仅在直接连接 IP 匹配 `trustedProxies` 时才读取代理头，防止 IP 伪造
- **异步写入**：审计日志和数据库持久化均异步执行，不阻塞响应
- 同时写入内存审计链（`AuditStore`）和数据库持久化表

### 管理端点独立端口

`ADMIN_PORT` 环境变量控制健康检查、指标、OpenAPI 文档等管理端点的端口：

- `ADMIN_PORT > 0`：管理端点绑定独立端口 + 独立 hostname
- `ADMIN_PORT = 0`：所有端点在同一业务端口（不推荐生产使用）

### MFA 恢复需要 TOTP 验证码

`recoverMFA` 方法要求提供有效 TOTP 验证码，验证通过后颁发临时 Token（60 秒有效），不直接跳过 MFA。

### 缓存键租户命名空间

`createCacheKeyNamespace(tenantId)` 生成带租户前缀的缓存键：

```
tenantId 存在时: tenant:acme:user:detail:123
tenantId 缺失时: user:detail:123
```

多租户场景下缓存数据天然隔离。

## 编码约束

- 新增路由必须挂载在 protected router（经 authMiddleware 保护）
- 权限格式：`system:模块:操作`（如 `system:user:list`）
- 服务使用工厂函数模式，不使用 class
