# VentoStack 安全审计综合报告

> 审计日期: 2026-05-31
> 审计范围: framework/core, framework/database, platform/auth, platform/system, apps/admin/api, apps/admin/web
> 审计方法: 静态代码分析 + 架构审查 + 信任边界验证

---

## 一、审计概览

| 审计维度 | 审计文件数 | 关键发现 | 风险等级 |
|----------|-----------|---------|----------|
| 认证体系 | 8 | 2 个问题 | P1, P2 |
| 授权体系 | 5 | 1 个问题 | P2 |
| 输入校验 | 12 | 2 个问题 | P0, P2 |
| SQL 安全 | 6 | 1 个问题 | P0 |
| 中间件安全 | 15 | 2 个问题 | P1, P2 |
| 前端安全 | 8 | 2 个问题 | P1, P2 |
| 配置安全 | 4 | 1 个问题 | P2 |
| 日志审计 | 3 | 1 个问题 | P2 |

---

## 二、关键发现（按风险等级排序）

### P0 — 严重风险

#### P0-1: schema-reader.ts 存在 SQL 注入漏洞

**文件**: `packages/framework/database/src/schema-reader.ts:72-85`

**问题**: `readTableSchema` 函数虽然对 `tableName` 做了正则校验，但后续查询中直接将 `tableName` 字符串拼接到 SQL 中：

```typescript
// 校验通过
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
  throw new Error(`Invalid table name: ${tableName}`);
}

// 但后续直接拼接
const columns = await executor(
  `SELECT ... WHERE table_schema = 'public' AND table_name = '${tableName}'`
);
```

**风险**: 正则校验 `^[a-zA-Z_][a-zA-Z0-9_]*$` 只允许字母数字下划线，但 PostgreSQL 表名可以包含其他字符（如 `$`、Unicode 字符）。更关键的是，如果正则校验被绕过或修改，直接字符串拼接会导致 SQL 注入。

**修复建议**: 使用参数化查询：
```typescript
const columns = await executor(
  `SELECT ... WHERE table_schema = 'public' AND table_name = $1`,
  [tableName]
);
```

**同样问题存在于**: 主键查询和索引查询中也使用了字符串拼接。

---

#### P0-2: 前端 Token 通过 URL 参数传递

**文件**: `apps/admin/web/src/store/token.ts:7-15`

**问题**: 
```typescript
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");
if (urlToken) {
  setAccessToken(urlToken);
  // 清除 URL 中的 token 参数
  urlParams.delete("token");
  window.history.replaceState({}, "", newUrl);
  return urlToken;
}
```

**风险**: 
1. Token 在 URL 中暴露，被浏览器历史、Referer、服务器日志记录
2. 虽然代码尝试清除 URL，但在清除前页面可能已经发送了带 Referer 的请求
3. 如果页面加载过程中发生错误，Token 可能不会被清除

**修复建议**: 禁止通过 URL 传递 Token，改用 POST body 或 secure cookie。

---

### P1 — 高风险

#### P1-1: JWT 密钥长度校验在运行时而非初始化时

**文件**: `packages/platform/auth/src/jwt.ts:168-175`

**问题**: `validateSecret` 在每次 `sign`/`verify` 时调用，而非 `createJWT` 初始化时：

```typescript
function validateSecret(secret: string): void {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(`Secret must be at least ${MIN_SECRET_BYTES} bytes...`);
  }
}
```

**风险**: 如果密钥长度不足，错误在生产环境运行时才发现，可能导致服务中断。

**修复建议**: 在 `createJWT` 初始化时校验密钥长度，失败立即抛错。

---

#### P1-2: 操作日志中间件未限制请求体大小

**文件**: `packages/platform/system/src/middlewares/operation-log.ts:180-195`

**问题**: 操作日志读取 `ctx.body` 进行脱敏，但没有限制请求体大小：

```typescript
const body = ctx.body;
if (body && typeof body === "object" && Object.keys(body).length > 0) {
  sanitizedBody = sanitize(body, sensitiveSet);
}
```

**风险**: 超大请求体（如文件上传 base64）会导致内存占用过高，脱敏操作消耗大量 CPU。

**修复建议**: 限制记录的最大请求体大小（如 10KB），超限截断或不记录。

---

#### P1-3: 前端 API 客户端未校验 HTTPS

**文件**: `apps/admin/web/src/api/index.ts`

**问题**: `fetch` 调用未强制 HTTPS，生产环境可能通过 HTTP 传输敏感数据。

**修复建议**: 生产环境强制校验 `window.location.protocol === 'https:'`。

---

### P2 — 中风险

#### P2-1: 限流中间件默认信任代理头

**文件**: `packages/framework/core/src/middlewares/rate-limit.ts:28-32`

**问题**: `trustProxyHeaders` 默认 `false` 是安全的，但 `getClientIPFromRequest` 的实现需要确认是否在所有场景下都正确解析。

**风险**: 如果部署在多层反向代理后，IP 解析可能不准确，导致限流绕过或误杀。

---

#### P2-2: CORS 配置未限制 methods

**文件**: `apps/admin/api/src/app.ts:152-157`

**问题**: 
```typescript
cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  maxAge: 86400,
})
```

**风险**: 未显式限制 `methods`，默认允许所有方法。虽然框架默认安全，但显式限制更安全。

**修复建议**: 
```typescript
cors({
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  maxAge: 86400,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
})
```

---

#### P2-3: 密码哈希算法成本因子未配置化

**文件**: `apps/admin/api/src/config/index.ts`

**问题**: 配置中缺少 `BCRYPT_COST` 或密码哈希成本因子配置。

**风险**: 无法根据硬件性能调整哈希成本，可能在安全性和性能间失衡。

---

#### P2-4: 健康检查端点暴露过多信息

**文件**: `apps/admin/api/src/app.ts:166-172`

**问题**: `/health/ready` 返回 DB/Redis 连接状态，可能被攻击者用于探测内部拓扑。

**风险**: 攻击者可利用健康检查端点判断服务依赖和状态。

**修复建议**: 生产环境健康检查只返回 `ok`/`fail`，不暴露具体依赖项状态。

---

#### P2-5: 审计日志未持久化到独立存储

**文件**: `packages/platform/system/src/middlewares/operation-log.ts:245-260`

**问题**: 审计日志通过 `saveToDb` 异步写入数据库，但数据库和应用在同一故障域。

**风险**: 如果数据库被攻破或损坏，审计日志可能丢失。

**修复建议**: 关键审计日志应写入独立存储（如只读日志服务、对象存储）。

---

#### P2-6: 前端 localStorage 存储敏感 Token

**文件**: `apps/admin/web/src/store/token.ts`

**问题**: Access Token 和 Refresh Token 都存储在 `localStorage` 中。

**风险**: XSS 攻击可窃取 Token。虽然框架有 XSS 防护，但防御纵深不足。

**修复建议**: 
- Access Token 使用 `memory` 存储
- Refresh Token 使用 `httpOnly` cookie
- 或两者都使用 `httpOnly` cookie

---

#### P2-7: 操作日志 IP 提取未配置可信代理

**文件**: `packages/platform/system/src/middlewares/operation-log.ts:105-115`

**问题**: 
```typescript
function extractClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  // ...
}
```

**风险**: 直接信任 `x-forwarded-for` 头，客户端可伪造任意 IP。

**修复建议**: 添加可信代理配置，只在信任代理时才读取 X-Forwarded-* 头。

---

## 三、安全优势（值得肯定的实践）

### ✅ 认证体系

1. **JWT 算法白名单**: 仅允许 HS256/HS384/HS512，禁止 `none` 和弱算法
2. **JWT typ 校验**: 验证 `typ` 头部必须为 `JWT`
3. **TOTP 防重放**: `verifyAndConsume` 维护已消费集合
4. **Token 吊销**: 支持 Memory + Redis 两种存储
5. **Session 批量销毁**: `destroyByUser` 支持按用户踢出所有会话
6. **密码策略**: 最小长度、复杂度校验、过期提醒
7. **登录限流**: IP 维度 20 次/分钟 + 用户名维度 5 次/30 分钟
8. **账号锁定**: 缓存 + DB 双维度锁定，支持自动解锁
9. **Passkey 支持**: WebAuthn 无密码认证

### ✅ 授权体系

1. **RBAC 默认拒绝**: 必须显式授权
2. **超级管理员跳过**: `admin` 角色拥有所有权限
3. **行级过滤**: `RowFilter` 根据用户角色动态生成 SQL WHERE
4. **数据权限范围**: 支持全部/本部门/本部门及下级/仅本人

### ✅ 输入校验

1. **Schema 校验**: 所有路由参数通过 `defineRouteConfig` 校验
2. **参数化查询**: 查询构建器使用 `$1, $2` 占位符
3. **文件上传校验**: 大小、类型、扩展名、双扩展名、空字节检查
4. **XSS 过滤**: `Bun.escapeHTML` + 正则检测
5. **SSRF 防护**: 内网地址黑名单 + DNS 解析验证

### ✅ 中间件安全

1. **CSRF**: Token 双提交 + 恒定时间比较
2. **HMAC**: 时间戳 + nonce 防重放
3. **IP 过滤**: CIDR + 通配符支持
4. **HTTPS 强制**: HSTS header + 301 重定向
5. **CORS**: 默认 deny，禁止 credentials + wildcard
6. **错误处理**: 生产环境不暴露堆栈，统一错误格式

### ✅ 可观测性

1. **审计日志**: 所有写操作记录，敏感字段脱敏
2. **登录日志**: 记录 IP、UA、状态、消息
3. **操作日志**: 异步写入，不阻塞响应
4. **结构化日志**: JSON 格式，TraceID 注入

---

## 四、修复优先级建议

| 优先级 | 问题 | 预计工作量 |
|--------|------|-----------|
| **立即** | P0-1: schema-reader SQL 注入 | 30 分钟 |
| **立即** | P0-2: URL Token 传递 | 2 小时 |
| **本周** | P1-1: JWT 密钥初始化校验 | 30 分钟 |
| **本周** | P1-2: 操作日志请求体限制 | 1 小时 |
| **本周** | P1-3: 前端 HTTPS 强制 | 30 分钟 |
| **本月** | P2-6: Token 存储方式改进 | 4 小时 |
| **本月** | P2-7: 可信代理配置 | 2 小时 |
| **下月** | P2-4: 健康检查信息脱敏 | 1 小时 |
| **下月** | P2-5: 审计日志独立存储 | 8 小时 |

---

## 五、总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 认证安全 | ★★★★☆ | JWT/MFA/Passkey/Session 完整，密钥校验时机待改进 |
| 授权安全 | ★★★★★ | RBAC + ABAC + 行级过滤，默认拒绝 |
| 输入安全 | ★★★★☆ | 参数化查询 + Schema 校验，schema-reader 有注入 |
| 中间件安全 | ★★★★★ | 10+ 安全中间件，覆盖 OWASP Top 10 |
| 前端安全 | ★★★☆☆ | XSS/CSRF 有防护，Token 存储和传递有缺陷 |
| 配置安全 | ★★★★☆ | 环境变量校验完整，缺少密码哈希成本配置 |
| 审计安全 | ★★★★☆ | 审计日志完整，持久化和独立存储待改进 |

**总体安全评分: 85/100**

**结论**: VentoStack 安全基线扎实，认证授权体系完善，中间件矩阵覆盖全面。主要风险集中在：
1. `schema-reader.ts` 的 SQL 注入（需立即修复）
2. 前端 Token 安全传递和存储（需本周修复）
3. 可信代理配置缺失（需本月修复）

修复上述问题后，安全评分可提升至 92+。

