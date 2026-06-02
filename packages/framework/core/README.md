# @ventostack/core

HTTP 路由、Context、中间件、错误处理、生命周期管理。

## 模块定位

Core 是 VentoStack 的核心框架层，不依赖任何上层能力包。提供路由编译、中间件链、请求上下文、Schema 校验和生命周期钩子。

## 安全特性

### Schema 校验 strict 模式

路由 schema 默认 `strict: true`，拒绝未知字段。未在 schema 中声明的字段会被丢弃并返回 `VALIDATION_ERROR`，防止参数注入。

```typescript
// strict 默认开启，无需显式配置
router.post("/api/users", { body: { name: { type: "string", required: true } } }, handler);
// 请求体包含未知字段时返回 400
```

### IP 提取与可信代理

`createOperationLogMiddleware` 和业务层提取客户端 IP 时，仅在直接连接 IP 匹配 `trustedProxies` 列表时才读取 `X-Forwarded-For` / `X-Real-IP`。空列表表示不信任任何代理头。

### 错误处理

- 生产环境 (`NODE_ENV=production`) 不返回堆栈信息
- 未处理异常返回统一 `fallbackMessage`（默认 "服务器内部错误"），不暴露内部细节
- `ValidationError` 返回结构化 `details`，不含 SQL 或文件路径

### Server 头隐藏

HTTP 响应隐藏实现细节，统一标识为 VentoStack。

### CORS 精确 origin 匹配

CORS 中间件要求精确 origin 匹配，禁止通配符 `*` 用于生产环境。

### CSRF 双提交

支持 Cookie + Token 双提交 CSRF 防护模式。

### SSRF 私有地址拦截

出站请求拦截私有网络地址（127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16）。

### 上传安全

Schema `file` 类型支持 `allowedMimeTypes`、`allowedExtensions`、`maxSize`、`maxFiles` 约束。

### 多租户中间件

`createTenantMiddleware` 在 `TENANT_ENABLED=true` 时自动从 JWT 注入 `tenant_id`，不依赖前端传递。

## 编码约束

- 所有外部输入必须经 Schema 校验，`strict` 不得显式设为 `false`
- 禁止 SQL 字符串拼接
- 敏感数据（password、token、secret 等）必须脱敏后方可记录或返回
- 每个路由必须有明确的认证和权限中间件
