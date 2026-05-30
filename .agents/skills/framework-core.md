---
name: framework-core
description: |
  开发或修改 @ventostack/core 框架层代码时必须遵循的规范。
  涵盖路由、Context、中间件、错误处理、生命周期、安全中间件的实现约定。
  适用于 Claude Code / Codex 等 AI 工具在 framework/core 目录下的编码任务。
---

# Framework Core — AI Agent 编码规范

## 核心原则

1. **Bun-First**: 优先使用 Bun 内置 API，其次 Web 标准 API，最后才考虑第三方包。
2. **函数式优先**: 禁止 class（Error 类除外），用高阶函数组合替代继承。
3. **显式依赖**: 所有依赖通过参数传递，禁止隐式全局挂载。
4. **编译期安全**: 泛型必须有约束，公共 API 必须有显式返回类型，禁止 `any`。
5. **默认安全**: 新增中间件必须考虑信任边界，跨边界数据默认不可信。

## 文件与命名

- 文件名: `kebab-case.ts`
- 函数名: `camelCase`
- 常量: `UPPER_SNAKE_CASE`
- 工厂函数前缀: `create`（如 `createRouter`、`createRateLimiter`）
- 类型前缀: 无强制，但接口名用 PascalCase
- 每个文件只做一件事，控制在 300 行以内

## 路由系统（router.ts）

### 新增路由能力时的约束

```typescript
// ✅ 正确: 使用编译期类型推导
export type InferParams<Path extends string> = ...

// ✅ 正确: 路由处理器使用显式泛型
export type RouteHandler<
  TParams extends Record<string, unknown> = Record<string, string>,
  TQuery extends Record<string, unknown> = Record<string, string>,
  TBody extends Record<string, unknown> = Record<string, unknown>,
> = (ctx: Context<TParams, TQuery, TBody>) => Promise<TypedResponse> | TypedResponse;

// ❌ 禁止: 隐式 any 参数
const handler = (ctx) => { ... }

// ❌ 禁止: 运行时反射获取参数类型
const params = Reflect.getMetadata(...)
```

### 参数类型约束

- 支持的参数类型白名单: `string | number | boolean | uuid | date | email | regex`
- 自定义正则必须校验合法性，防止 ReDoS
- 路由冲突检测必须在注册时完成，不允许静默覆盖

## Context（context.ts）

### 扩展 ContextState

```typescript
// ✅ 正确: 通过模块扩展声明
declare module "@ventostack/core" {
  interface ContextState {
    user?: { id: string; name: string };
    tenant?: string;
  }
}

// ❌ 禁止: 直接修改 Context 接口或全局挂载
(ctx as any).user = ...
```

## 中间件（middleware.ts）

### 中间件签名

```typescript
export type Middleware = (
  ctx: Context,
  next: () => Promise<Response>,
) => Promise<Response> | Response;
```

### 新增中间件的 checklist

- [ ] 是否使用 `compose` 组合？
- [ ] 是否支持中断（提前 return Response）？
- [ ] 错误处理是否使用 `VentoStackError` 子类？
- [ ] 是否包含 `code` 和 `status` 字段？
- [ ] 生产环境是否脱敏（不泄露堆栈、SQL、内部拓扑）？
- [ ] 是否有独立测试文件（`.test.ts`）？
- [ ] 是否导出到 `index.ts`？

### 安全中间件特殊要求

| 中间件 | 必须实现 |
|--------|----------|
| CORS | 白名单精确匹配，禁止通配符 `*` |
| CSRF | Cookie `HttpOnly` + `Secure` + `SameSite=Strict` |
| RateLimit | Token Bucket，支持 IP / 用户 / 接口多维度 |
| XSS | 输出编码，禁止内联脚本 |
| HMAC | 时间戳 + nonce 防重放，nonce 原子去重 |
| Upload | 限制类型、大小、扫描恶意内容 |
| Timeout | 默认 30s，可配置 |
| IPFilter | 支持 CIDR，盲信 X-Forwarded-* 前需 trusted proxy |

## 错误处理（errors.ts）

### 错误类层次

```
VentoStackError (abstract)
├── ClientError (4xx)
│   ├── NotFoundError
│   ├── ValidationError
│   ├── UnauthorizedError
│   └── ForbiddenError
└── ServerError (5xx)
```

### 新增错误类的约束

- 必须继承 `VentoStackError`
- 必须包含 `code: string` 和 `status: number`
- 必须保留原始错误（`cause`）
- 禁止在错误消息中暴露敏感信息

```typescript
// ✅ 正确
export class MyBusinessError extends ClientError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { code: "MY_BUSINESS_ERROR", status: 400, cause: options?.cause });
  }
}
```

## 生命周期（app.ts）

### 钩子顺序

```
beforeStart → afterStart → beforeStop → afterStop
```

### 优雅关闭

- 先摘流量（ readiness 返回 false ）
- 等待存量请求完成（ configurable timeout，默认 30s ）
- 释放连接池
- 停止调度器
- 退出进程

## 测试

- 测试文件与被测文件同目录，后缀 `.test.ts`
- 使用 `bun:test`
- 优先 mock 外部服务，不 mock 框架核心模块
- 安全中间件必须有失败用例覆盖

## 禁止事项

- ❌ 引入 Express / Fastify / Koa 风格抽象
- ❌ 使用 class（Error 除外）
- ❌ 使用 `any`，特殊情况用 `unknown` + 窄化
- ❌ 运行时反射（`Reflect.metadata` 等）
- ❌ 隐式依赖注入容器
- ❌ 字符串拼接 SQL（必须用参数化查询）
- ❌ 生产环境返回堆栈信息
