# VentoStack 后端框架 — 技术实施文档

> 逐项拆解 roadmap 中每个功能点的技术实现方式，标注哪些用 Bun 原生能力、哪些自研。

---

## Bun Workspaces 多包架构

框架采用 Bun Workspaces 管理 Monorepo：

```json
// package.json（根目录）
{
  "name": "ventostack-framework",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun --hot packages/cli/src/dev.ts",
    "build": "bun run packages/cli/src/build.ts",
    "test": "bun test --coverage"
  },
  "devDependencies": {
    "typescript": "^5.4"
  }
}
```

```toml
# bunfig.toml（根目录）
[install]
registry = "https://registry.npmjs.org"

[run]
env = ".env"
```

---

## 符号说明

| 符号 | 含义 |
|------|------|
| `Bun` | 直接使用 Bun 内置 API，零自研 |
| `Wrap` | 基于 Bun 能力做轻量封装（函数包装、类型封装） |
| `Build` | 自研实现，Bun 无对应能力 |

---

## 一、核心基础层

### 1.1 应用生命周期管理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 启动/关闭 hooks | `Build` | `VentoStackApp` 类内部维护 hooks 数组，`beforeStart`/`afterStart`/`beforeStop` 分别存储，按注册顺序执行 |
| 优雅关闭 | `Wrap` | `Bun.serve()` 的 `server.stop()` + 自定义等待逻辑 |
| 等待存量请求完成 | `Build` | 维护 `activeRequests` 计数器（`Atomics`），`beforeStop` 中循环等待归零或超时 |
| 连接池释放 | `Wrap` | `Bun.sql.close()` + `Bun.redis.quit()` 在 `beforeStop` 中顺序调用 |
| 多实例协调（k8s） | `Build` | 监听 `SIGTERM` 信号，配合 `/health/ready` 返回 `503` 让 k8s 摘除流量 |

**关键代码**：
```typescript
class VentoStackApp {
  private activeRequests = 0;
  private shuttingDown = false;

  async listen(port: number) {
    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        if (this.shuttingDown) return new Response("Service Unavailable", { status: 503 });
        this.activeRequests++;
        try {
          return await this.handleRequest(req);
        } finally {
          this.activeRequests--;
        }
      },
    });
  }

  async close(timeout = 30000) {
    this.shuttingDown = true;
    const start = Date.now();
    while (this.activeRequests > 0 && Date.now() - start < timeout) {
      await Bun.sleep(100);
    }
    await this.server?.stop();
  }
}
```

---

### 1.2 路由系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 静态/动态路由 | `Wrap` | 基于 `Bun.serve({ routes: {} })`，启动时编译为原生格式 |
| 路由分组 | `Build` | `RouterGroup` 类，支持嵌套，启动时扁平化合并到 `Bun.serve` 路由表 |
| RESTful 快捷注册 | `Build` | `router.resource("/users", UserController)` 展开为 5 条路由 |
| 路由命名与反向 URL | `Build` | 路由注册时存储 `name → path` 映射，`url("user.show", { id: 1 })` 生成 `/users/1` |
| 路由参数约束 | `Build` | 支持 `:id(\d+)` 正则约束，不匹配时跳过到下一个路由 |
| 路由冲突检测 | `Build` | 启动时遍历所有路由，检测 path+method 重复，抛出异常 |
| WebSocket / SSE 路由 | `Wrap` | `Bun.serve({ websocket: {} })` + 框架层房间管理封装 |
| 路径参数类型推导 | `Build` | `:id<int>`、`:postId<string>`、`:flag<bool>`，TypeScript 泛型从路径字符串推导 params 类型，中间件自动转换 |

**关键设计**：
```typescript
// 启动时编译为 Bun.serve() 原生格式
const compiledRoutes: Record<string, any> = {};
for (const route of this.routes) {
  const bunPath = route.path.replace(/:([^\/]+)/g, ":$1"); // /users/:id
  compiledRoutes[bunPath] = {
    [route.method]: async (req) => {
      const ctx = new Context(req, route.params);
      return await this.pipeline.execute(ctx, route.handler);
    },
  };
}
Bun.serve({ routes: compiledRoutes, fetch: fallbackHandler });
```

**路径参数类型推导**：
```typescript
// 路径参数使用类型标记：:id<int>、:postId<string>、:flag<bool>
router.get("/users/:id<int>/posts/:postId<string>", async (ctx) => {
  // TypeScript 自动推导 ctx.params 类型：
  // ctx.params.id     → number（中间件已执行 parseInt）
  // ctx.params.postId → string
  ctx.json({ id: ctx.params.id, postId: ctx.params.postId });
});

// 泛型从路径字符串字面量推导（无需手动声明）
// "/users/:id<int>" 自动推导为 { id: number }
// "/items/:itemId<string>/enable/:flag<bool>" 自动推导为 { itemId: string; flag: boolean }
```

---

### 1.3 中间件系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 全局/路由级/分组中间件 | `Build` | 每个路由维护 `middleware[]`，启动时合并为执行链 |
| 洋葱模型 | `Build` | 递归 `compose` 实现：`middleware[i](ctx, () => middleware[i+1](...))` |
| 内置中间件 | `Wrap` | CORS/限流/压缩/日志/鉴权/超时 — 基于 Bun 能力封装 |
| 中断与跳过 | `Build` | 中间件内 `throw new AbortRequest(response)` 提前返回 |

**洋葱模型实现**：
```typescript
function compose(middleware: Middleware[]) {
  return function(ctx: Context, handler: RouteHandler) {
    let index = -1;
    function dispatch(i: number): Promise<void> {
      if (i <= index) return Promise.reject(new Error("next() called multiple times"));
      index = i;
      const fn = i < middleware.length ? middleware[i] : handler;
      if (!fn) return Promise.resolve();
      return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
    }
    return dispatch(0);
  };
}
```

---

### 1.4 请求/响应封装

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Context 对象 | `Build` | 封装 Request + Response + 元数据，挂载到请求上下文 |
| 参数解析 | `Wrap` | `req.url` 解析 query，`req.params` 解析路径参数，`req.json()` 解析 body |
| 自动绑定 | `Build` | DTO Schema 校验 + 自动映射到对象，支持 JSON/Form |
| 参数验证 | `Build` | 轻量 Schema 校验器，支持必填/类型/范围/正则/自定义规则 |
| 响应封装 | `Build` | 统一 `{ code, message, data }` 结构，Interceptor 自动包装 |
| 流式响应 | `Wrap` | `new Response(ReadableStream)`，Bun 原生支持 |
| 文件下载 | `Wrap` | `Bun.file(path)` 作为 Response body |
| 重定向 | `Wrap` | `Response.redirect(url, status)` |
| 内容协商 | `Build` | 根据 `Accept` 头选择 JSON/XML/MessagePack 序列化 |

**参数验证实现**：
```typescript
const CreateUserSchema = {
  email:    { type: "string", required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { type: "string", required: true, min: 8, max: 128 },
  age:      { type: "number", min: 0, max: 150 },
};

function validate(data: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];
  for (const [key, rules] of Object.entries(schema)) {
    const value = (data as Record<string, unknown>)?.[key];
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${key} is required`);
      continue;
    }
    if (value !== undefined && typeof value !== rules.type) {
      errors.push(`${key} must be ${rules.type}`);
    }
    if (rules.pattern && !rules.pattern.test(String(value))) {
      errors.push(`${key} format invalid`);
    }
  }
  return { valid: errors.length === 0, errors };
}
```

---

### 1.5 请求处理管线

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Middleware / Interceptor / Filter 三层 | `Build` | Middleware 最先执行 → Interceptor 包裹 handler → Filter 捕获异常 |
| 横切关注点 | `Build` | 每个关注点作为独立中间件，通过 `router.use()` 注册 |
| 全局异常处理 | `Build` | `try/catch` 包裹整个管线，Filter 链捕获并映射为 HTTP 响应 |

---

### 1.6 多协议支持

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| HTTP REST | `Bun` | `Bun.serve()` 原生支持 |
| WebSocket | `Wrap` | `Bun.serve({ websocket: {} })` + 框架层房间管理 |
| gRPC | `Build` | 基于 `@grpc/grpc-js` 或自研 HTTP/2 解析（低优先级） |
| 内部 RPC | `Build` | 基于 HTTP/2 + MessagePack 的轻量 RPC（替代 gRPC） |

---

## 二、配置系统

### 2.1 多来源配置

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 环境变量 `.env` | `Bun` | Bun 自动加载 `.env`，`process.env` 直接读取 |
| 配置文件 YAML | `Bun` | `import cfg from "./config.yaml" with { type: "yaml" }` |
| 命令行参数 | `Build` | `Bun.argv` 解析，`--database.host=localhost` 格式 |

### 2.2 环境管理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 分环境配置 | `Build` | `app.yaml` + `app.dev.yaml` + `app.prod.yaml`，按 `NODE_ENV` 自动加载 |
| 配置优先级 | `Build` | Schema default < YAML < env-specific YAML < .env < 环境变量 < CLI 参数 |
| 动态热更新 | `Wrap` | `Bun.file().stat().mtime` 轮询变更，触发 callback |

### 2.3 安全与类型

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 类型安全 | `Build` | `createConfig({ ... })` 返回类型安全对象，Schema 校验每个值 |
| 敏感信息管理 | `Build` | 敏感字段标记 `secret: true`，日志中自动脱敏，支持 Vault 集成 |
| 敏感配置加密 | `Build` | AES-GCM 加密存储，运行时解密，密钥通过环境变量注入 |
| 密钥版本与轮换 | `Build` | JWT/HMAC/数据加密密钥均带 `kid`，验证支持多版本并行窗口，生产环境优先接入 Vault/KMS |
| 生产安全预检 | `Build` | 启动时检查关键 secret 缺失/过短、`DEBUG=true`、未开启 HTTPS、管理端点暴露等高风险配置，失败直接拒绝启动 |

**配置系统核心实现**：
```typescript
// 见 技术架构分析.md 3.1.6 节
// 核心：Schema 定义 + 多源合并 + envToNested 展开 + 类型推导
```

---

## 三、模块化系统

### 3.1 模块架构

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 模块隔离 | `Build` | 每个模块独立目录，通过 `export` 暴露接口，无运行时隔离（TS 编译时隔离） |
| 模块依赖图 | `Build` | `createApp({ modules: [UserModule, OrderModule] })` 按数组顺序初始化 |
| 插件化加载 | `Build` | 插件是带 `install(app)` 方法的对象，`app.use(plugin)` 注册 |
| 按需加载 | `Build` | `FeatureToggle` 配置项控制模块是否加载，未加载的模块代码不执行 |
| 模块自动扫描 | `Build` | 默认自动扫描 `app/modules/` 或 `app/**/*.module.ts`，`disabled: true` 跳过 |

**模块注册**：
```typescript
const userModule = {
  name: "user",
  install(app: VentoStackApp) {
    app.router.group("/api/users", (group) => {
      group.get("/", listUsers);
      group.get("/:id", getUser);
    });
  },
};

// 手动注册
createApp({ modules: [userModule] });

// 自动扫描（默认行为）
// 自动加载 app/modules/ 或 app/**/*.module.ts 下 export default 的模块对象
// 模块标记 disabled: true 时跳过注册
```

---

## 四、数据访问层

### 4.1 ORM / 数据库抽象

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 链式查询构造器 | `Build` | `QueryBuilder` 类，方法链累积条件，最后编译为 `sql` 标签模板 |
| CRUD 封装 | `Build` | `db.query(Model).list()` / `.get()` / `.insert()` / `.update()` / `.delete()` / `.count()` |
| 事务支持 | `Wrap` | `Bun.sql.transaction(async (tx) => { ... })` |
| 嵌套事务/Savepoint | `Wrap` | 在 `sql.transaction()` 内跟踪嵌套层级，用 `SAVEPOINT` 实现 |
| 批量插入 | `Wrap` | `sql`INSERT INTO users ${sql(rows, "name")}`` |
| 批量更新 | `Wrap` | `CASE WHEN` 批量更新或单条 `UPDATE` 循环 |
| 软删除 | `Build` | Model 标记 `softDelete: true`，查询自动注入 `deleted_at IS NULL` |
| 逻辑删除/物理删除 | `Build` | `.delete()` 自动 UPDATE `deleted_at`；`.hardDelete()` / `.delete({ force: true })` 物理删除；`.restore()` 恢复 |
| 乐观锁 | `Build` | `version` 字段，`UPDATE ... WHERE version = ${oldVersion}`，返回行数 0 则冲突 |
| 关联关系 | `Build` | `defineRelation()` 声明 hasOne/hasMany/belongsTo，查询时自动 JOIN |
| Eager Loading | `Build` | `.include(u => u.posts)` 自动 JOIN 并映射嵌套结果 |
| Lazy Loading | `Build` | 访问关联属性时自动发起查询（代理模式） |
| 原生 SQL | `Wrap` | `db.raw(sql`SELECT * FROM ...`)` 直接执行，已防注入 |
| 多数据库驱动 | `Wrap` | `new SQL({ adapter: "mysql" | "postgres" | "sqlite" })` |
| 读写分离 | `Build` | 配置 `master` + `replicas`，查询自动路由到 replica，写操作路由到 master |
| 连接池 | `Wrap` | `Bun.sql` 内部已管理连接池，框架层只暴露配置项 |
| insert/update 返回新对象 | `Build` | `insert(data, { returning: true })` / `update(data, { returning: true })` 返回完整对象；默认返回 void |

**ORM 核心实现**：
```typescript
// 见 技术架构分析.md 3.2.1 节
// 核心：defineModel() Schema 定义 + QueryBuilder 链式 API + 类型推导
```

**ORM 安全性**：
- SQL 注入防护：`Bun.sql` 标签模板自动参数化，禁止字符串拼接
- 字段白名单：insert/update 只接受 Model 定义字段，拒绝未知字段
- 批量限制：查询结果集大小限制，防止内存溢出
- 查询超时：每条 SQL 可配置最大执行时间
- 只读模式：只读连接禁止执行写操作

### 4.2 数据库迁移

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 版本化 Migration | `Build` | 时间戳前缀命名 `20260417_001_create_users.ts`，`up`/`down` 函数 |
| 自动检测 Schema 差异 | `Build` | 对比数据库 `information_schema` 与 Model 定义，生成差异迁移 |
| Seed 数据填充 | `Build` | `database/seeds/` 目录，`.ts` 文件执行插入逻辑 |
| 迁移状态记录 | `Build` | `__migrations` 表记录已执行迁移，防止重复执行 |
| 回滚 | `Build` | 按 `__migrations` 逆序执行 `down` 函数 |

**迁移 CLI**：
```bash
ventostack migrate generate create_users    # 生成模板文件
ventostack migrate up                       # 执行未执行的迁移
ventostack migrate down --steps 1           # 回滚最近1次
ventostack migrate status                   # 显示迁移状态表
```

### 4.3 缓存系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 统一缓存接口 | `Build` | `CacheManager` 接口，`get`/`set`/`del`/`flush`，底层可替换 |
| TTL / 永久缓存 | `Wrap` | `Bun.redis.set(key, val, { ex: 3600 })` |
| 标签缓存 | `Build` | 每个 tag 维护 key 集合，`flushTags(["user"])` 遍历删除 |
| 缓存穿透防护 | `Build` | `singleflight` 模式：同 key 并发只查一次 DB；空值缓存 60s |
| 缓存雪崩防护 | `Build` | TTL 基础值 + 随机抖动 `Math.random() * 300`，避免同时失效 |
| 分布式锁 | `Wrap` | `redis.set(key, val, { nx: true, ex: 30 })` |
| 二级缓存 | `Build` | L1 `Map` + TTL 内存缓存，L2 `Bun.redis`，先查 L1 再查 L2 |
| Cache Aside | `Build` | `cache.remember(key, ttl, () => db.query(...).list())` |
| Write Through | `Build` | 写操作同时更新 DB + Cache |
| 分布式一致性 | `Build` | 写操作后 `redis.del(key)` 失效缓存，配合消息队列广播 |

### 4.4 事务管理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 本地事务 | `Wrap` | `sql.transaction(async (tx) => { ... })` |
| 分布式事务 Saga | `Build` | 基于事件队列的 Saga 模式，每个步骤可补偿回滚 |
| 分布式事务 TCC | `Build` | Try-Confirm-Cancel 三阶段，基于 Redis 锁协调 |
| 自动回滚 | `Wrap` | `sql.transaction()` 内部自动 `ROLLBACK` |

---

## 五、安全体系

### 5.1 认证（Authentication）

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Session / Cookie | `Build` | `Bun.CookieMap` 设置 cookie，服务端 Redis/内存存储 session 数据；Cookie 默认 `HttpOnly + Secure + SameSite`，基于 Cookie 的认证路径必须启用 CSRF Token |
| JWT | `Build` | 基于 Web Crypto API（`crypto.subtle`）自研，不引入 jsonwebtoken 包；alg 白名单仅允许 `HS256/HS384/HS512/ES256/EdDSA`，密钥最小 256-bit，验证阶段带 `kid` 轮换与恒定时间比较 |
| JWT 刷新 | `Build` | Refresh Token 与 Access Token 分离密钥与生命周期；Refresh Token 存 Redis 或持久层，支持轮换、黑名单与设备级吊销 |
| JWT 吊销 | `Build` | Redis 维护 `jwt:blacklist:${jti}`，验证时检查 |
| OAuth2.0 / OIDC | `Build` | 封装 PKCE 流程，对接 Google/GitHub/微信等 |
| API Key | `Build` | 请求头 `X-API-Key` 校验，服务端仅存储哈希值，按哈希查询权限与租户上下文，不持久化明文 key |
| MFA (TOTP) | `Build` | 基于 `crypto` 实现 TOTP 生成/验证（RFC 6238） |
| 多端登录 | `Build` | Token 绑定 `device_id`，支持多设备同时在线 |

**JWT 自研实现**：
```typescript
// 基于 Web Crypto API，零外部依赖
async function signJWT(payload: JWTPayload, secret: Uint8Array): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return `${header}.${body}.${base64url(signature)}`;
}
```

验证阶段必须额外完成：
- 检查 `alg` 是否在白名单内，不接受降级或动态算法协商
- 检查 `kid`，从密钥环中选择当前版本或轮换窗口内旧版本
- 校验 `iss` / `aud` / `exp` / `nbf` / `jti`
- 对签名做恒定时间比较，避免普通字符串比较引入时序泄露

### 5.2 授权（Authorization）

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| RBAC | `Build` | 用户-角色-权限三级表，中间件检查 `ctx.user.role.has("admin")` |
| ABAC | `Build` | 基于属性表达式引擎，`{ resource: "order", action: "delete", condition: "order.owner == user.id" }` |
| 策略引擎 | `Build` | 轻量规则引擎，支持 `AND`/`OR`/`NOT` 组合 |
| 资源级权限 | `Build` | 数据查询时注入 `WHERE tenant_id = ? AND user_id = ?` 条件 |

### 5.3 安全防护

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| SQL 注入防护 | `Bun` | `Bun.sql` 标签模板自动参数化，禁止字符串拼接 |
| XSS 过滤 | `Build` | 以输出编码为主，`Bun.escapeHTML()` 用于默认转义；只有显式标记的 HTML 内容才允许进入渲染链，且必须先清洗 |
| CSRF Token | `Bun` | `Bun.CSRF.generate()` / `.verify()` 直接使用；基于 Cookie 的认证同时要求 `SameSite` 与 `X-CSRF-Token`，WebSocket 握手也校验来源与 token |
| CORS | `Build` | 默认 deny，按 origin allowlist 放行；禁止 `Access-Control-Allow-Credentials: true` 与 `*` 同时出现 |
| 请求签名 HMAC | `Build` | 基于 `Bun.CryptoHasher("sha256")` 计算签名；签名内容必须是 canonical request + timestamp + nonce，nonce 通过 Redis `SET NX EX` 原子去重，时间窗口默认 5 分钟 |
| SSRF 防护 | `Build` | 所有出站 HTTP 统一走受控 client，默认拒绝回环、本地链路和云元数据地址，仅 allowlist 可访问 |
| Open Redirect | `Build` | 所有跳转目标必须校验域名、来源或签名，禁止直接信任 query 中的 returnUrl |
| 上传安全 | `Build` | 校验扩展名、MIME、文件大小、文件数量、目标路径；不得直接信任客户端文件名或 Content-Type |
| 敏感数据加密 | `Build` | 密码用 `Bun.password`（argon2id），其他敏感数据 AES-GCM + AAD 绑定；建议生产环境集成 Vault / KMS 托管密钥 |
| 请求频率限制 | `Build` | Token Bucket 算法，基于 Redis Lua 脚本原子操作实现 |
| IP 黑白名单 | `Build` | 中间件检查 `server.requestIP(req)` 是否在列表中；只有请求来自 trusted proxy 时才信任 `X-Forwarded-*` |
| HTTPS 强制 | `Build` | 中间件检测 `X-Forwarded-Proto` 或 TLS 状态；仅在 trusted proxy 前提下信任转发头，非 HTTPS 时重定向或拒绝 |
| 输入校验 | `Build` | 所有入口强制 Schema 校验，未通过直接 400；同时限制 body 大小、JSON 深度、数组长度、字符串长度、上传大小与 MIME |

---

## 六、异步与任务系统

### 6.1 消息队列支持（低优先级）

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Kafka / RabbitMQ 适配 | `Build` | 提供统一 `MessageQueue` 接口，各后端实现适配器 |
| Producer / Consumer | `Build` | `mq.send(topic, message)` / `mq.consume(topic, handler)` |
| Retry / DLQ | `Build` | 消费失败重试 3 次，超次后转入死信队列 |
| 消息幂等性 | `Build` | 消息携带 `idempotency_key`，消费前 Redis `SET NX` 检查 |
| 可靠投递 | `Build` | Producer 持久化 + Consumer ACK 确认 |
| 优先级队列 | `Build` | Redis Sorted Set 按 score 排序消费 |

### 6.2 后台任务系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Cron Job | `Wrap` | `schedule("0 * * * *", handler)` 函数式注册，底层调用 `Bun.cron` |
| 延迟队列 | `Build` | Redis ZSet，`score = now + delay_ms`，轮询取过期任务 |
| 分布式调度 | `Build` | 任务执行前获取 Redis 分布式锁，防止多实例重复执行 |
| 任务可观测 | `Build` | 记录任务执行状态到 `__jobs` 表或 Redis Hash |
| 任务超时/重试 | `Build` | `Promise.race([task, sleep(timeout)])` 超时控制，失败重试 3 次 |
| 优雅停止 | `Build` | `beforeStop` 中标记停止标志，等待正在执行的任务完成 |

### 6.3 事件系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 同步/异步分发 | `Build` | `emit(event, payload, { sync: true })` 同步执行，`sync: false` 投递队列 |
| 多监听者 | `Build` | 每个事件维护 listener 数组，按注册顺序执行 |
| 事件队列化 | `Build` | 异步事件写入 Redis Stream，后台 Worker 消费 |
| 领域事件 | `Build` | ORM Hook 中自动触发：`afterInsert` / `afterUpdate` / `afterDelete` |
| 事件溯源 | `Build` | 所有领域事件持久化到事件表，支持 replay 重建状态 |

**事件系统函数式用法**：
```typescript
const userCreated = defineEvent<{ userId: string; email: string }>("user.created");
on(userCreated, async (payload) => {
  await emailService.sendWelcome(payload.email);
});
await emit(userCreated, { userId: "1", email: "test@example.com" });
```

### 6.4 Webhook 系统

Webhook 系统拆分为 `@ventostack/webhook` 和 `@ventostack/integration` 两个包，通过统一 `WebhookEvent` 模型串联。

#### 6.4.1 出站管理器（`@ventostack/webhook`）

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 订阅管理 | `Build` | `subscribe()` / `unsubscribe()`，支持事件过滤与自定义请求头 |
| 出站签名 | `Build` | `Bun.CryptoHasher(algorithm, secret)` 计算 HMAC，算法白名单：sha256/sha384/sha512 |
| 出站投递 | `Build` | `fetch()` POST JSON + 签名头，AbortController 超时控制 |
| 重试与退避 | `Build` | 指数退避 + 随机抖动，默认 5 次重试，超过上限进入死信 |
| 投递追踪 | `Build` | 每条投递记录状态（pending/sent/failed/dead）、HTTP 状态码、尝试次数 |
| 事件过滤 | `Build` | 订阅时指定事件列表，空数组匹配所有事件（通配） |
| 死信队列 | `Build` | 超过最大重试次数标记 dead，可查询与审计 |
| 事件驱动 | `Build` | `sendEvent(WebhookEvent)` 接收统一事件模型，可与 EventBus 无缝衔接 |

#### 6.4.2 入站验证器（`@ventostack/webhook`）

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Provider 体系 | `Build` | `WebhookProviderVerifier` 接口，可扩展新平台验证器 |
| 统一事件转换 | `Build` | `verifyAndConvert()` 验证签名后转换为 `WebhookEvent` |
| 内置通用 HMAC | `Build` | `createGenericHmacVerifier()` 不依赖 integration 包即可使用 |
| 恒定时间比较 | `Build` | 所有签名比对使用 timingSafeEqual，防止时序攻击 |
| RSA 非对称验签 | `Build` | `rsaSha256Verify()` 使用 crypto.subtle，支持微信支付/支付宝 |

#### 6.4.3 平台验证器（`@ventostack/integration`）

| 平台 | 算法 | 签名位置 | 特殊逻辑 |
|------|------|---------|---------|
| Stripe | HMAC-SHA256 | `Stripe-Signature` 头 | 时间戳 + 密钥轮换（多 v1） |
| GitHub | HMAC-SHA256 | `X-Hub-Signature-256` 头 | 提取 `X-GitHub-Event` 事件类型 |
| 钉钉 | HMAC-SHA256 | URL query `timestamp` + `sign` | Base64 + URL encode，1 小时容差 |
| Slack | HMAC-SHA256 | `X-Slack-Signature` + 时间戳头 | `v0:` 前缀，5 分钟容差 |
| Shopify | HMAC-SHA256 | `X-Shopify-Hmac-SHA256` 头 | Base64 编码（非 hex） |
| 微信支付 | RSA-SHA256 | `Wechatpay-Signature` 等多个头 | 非对称验签，支持多证书按 Serial 选择 |
| 支付宝 | RSA2/SHA256WithRSA | Body params `sign` + `sign_type` | 字典排序 key=value 拼接，非对称验签 |

**出站用法**：
```typescript
import { createOutboundWebhookManager } from "@ventostack/webhook";

const outbound = createOutboundWebhookManager({
  maxRetries: 5,
  retryInterval: 1000,
  maxRetryInterval: 60000,
  deliveryTimeout: 10000,
  signatureAlgorithm: "sha256",
});

outbound.subscribe({
  url: "https://partner.example.com/callback",
  secret: "whsec_...",
  events: ["order.created", "order.paid"],
  active: true,
});

// 直接发送
await outbound.send("order.created", { orderId: "123" });

// 或通过统一事件模型发送（与 EventBus 集成）
await outbound.sendEvent({ id: "...", type: "order.created", source: "my-app", payload: {...}, timestamp: Date.now() });
```

**入站用法**：
```typescript
import { createInboundVerifier, createGenericHmacVerifier } from "@ventostack/webhook";
import { createStripeVerifier } from "@ventostack/integration";

// 使用 Stripe 验证器
const verifier = createInboundVerifier({
  provider: createStripeVerifier(),
  config: { secret: "whsec_..." },
});
const event = await verifier.verifyAndConvert(rawBody, headers);

// 使用通用 HMAC（不依赖 integration 包）
const simpleVerifier = createInboundVerifier({
  provider: createGenericHmacVerifier("sha256", "x-signature"),
  config: { secret: "my-secret" },
});
```

**EventBus 集成**：
```typescript
import { createEventBus, defineEvent } from "@ventostack/events";
import { createOutboundWebhookManager } from "@ventostack/webhook";

const bus = createEventBus();
const outbound = createOutboundWebhookManager();

const OrderCreated = defineEvent<{ orderId: string }>("order.created");
bus.on(OrderCreated, async (payload) => {
  await outbound.sendEvent({
    id: crypto.randomUUID(),
    type: "order.created",
    source: "my-app",
    payload,
    timestamp: Date.now(),
  });
});
```

**安全考量**：
- 出站投递 URL 应配合 `createSSRFGuard` 中间件阻止回环/内网地址
- 所有签名比较使用恒定时间算法，防止时序攻击
- 投递超时使用 AbortController，避免连接挂起
- 密钥最小 256-bit，建议使用 `whsec_` 前缀的 base64 编码密钥
- Stripe/Slack 内置时间戳容差校验，防止重放攻击
- 微信支付/支付宝使用 RSA 非对称验签，平台证书需安全存储

---

## 七、可观测性

> **默认关闭（零开销）**：所有可观测能力默认不启用，通过 `observability: { enabled: true }` 开启。关闭时 `app.log`、`app.metrics`、trace 调用均为空操作（no-op），不产生运行时开销。

### 7.1 日志系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 分级日志 | `Build` | `DEBUG` / `INFO` / `WARN` / `ERROR` / `FATAL`，通过 `LOG_LEVEL` 过滤 |
| 结构化日志 | `Build` | JSON 格式 `{ timestamp, level, message, traceId, ... }` |
| TraceID / SpanID | `Build` | 中间件生成 `traceId = crypto.randomUUID()`，注入所有日志 |
| 日志轮转 | `Build` | 按日期/大小切割，`Bun.write()` 写入文件，定时清理旧文件 |
| 异步写入 | `Build` | 日志先写入内存队列，后台 Worker 批量刷盘 |
| 敏感字段脱敏 | `Build` | 遍历日志对象，匹配敏感 key（password/token/secret/key/cookie/authorization/phone/email/idcard）替换为 `***`；默认不记录完整请求体 |
| 多输出目标 | `Build` | Console + File + victoria-logs 远程推送 |
| victoria-logs | `Build` | HTTP POST 推送 JSON 日志到 victoria-logs 接口 |

### 7.2 链路追踪

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| OpenTelemetry | `Build` | 引入 `@opentelemetry/api` SDK，自动创建 Span |
| TraceContext 注入日志 | `Build` | 中间件将 traceId/spanId 写入 `ctx.state`，日志自动提取 |
| 跨服务传播 | `Build` | HTTP 请求头携带 `traceparent`，接收端解析注入上下文 |
| 接入 Jaeger/Tempo | `Build` | OTLP exporter 推送 trace 数据 |

### 7.3 指标监控

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| `/metrics` 接口 | `Build` | 自研 Prometheus text format 输出，不引入 prom-client；生产环境仅限内网、sidecar 或鉴权访问 |
| 内置指标 | `Build` | QPS 计数器、响应时间 histogram（bucket 划分）、错误率 gauge |
| 自定义指标 | `Build` | `app.metrics.counter("orders_created").inc()` |
| Grafana 集成 | `Build` | Prometheus 格式可被 Grafana 直接消费 |

**Prometheus 格式输出**：
```typescript
// GET /metrics
function renderMetrics(): string {
  const lines: string[] = [];
  // Counter
  lines.push(`# TYPE http_requests_total counter`);
  lines.push(`http_requests_total{method="GET",path="/api/users"} 1024`);
  // Histogram
  lines.push(`# TYPE http_request_duration_seconds histogram`);
  lines.push(`http_request_duration_seconds_bucket{le="0.1"} 950`);
  lines.push(`http_request_duration_seconds_bucket{le="0.5"} 990`);
  lines.push(`http_request_duration_seconds_count 1024`);
  return lines.join("\n");
}
```

### 7.4 健康检查

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| `/health/live` | `Build` | 进程存活即返回 `200 { status: "ok" }` |
| `/health/ready` | `Build` | 检查 DB/Redis/MQ 连通性，全部通过返回 `200`，否则 `503`；对外暴露时需受网络边界或鉴权控制 |
| k8s 探针 | `Build` | 路径和响应格式符合 k8s 探针规范 |

---

## 八、接口与文档

### 8.1 API 文档

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| OpenAPI 3.0 自动生成 | `Build` | 路由元数据携带 schema + description，启动时生成 JSON |
| Swagger UI / Redoc | `Build` | 内置静态文件服务，挂载 `/docs` 路由；生产环境默认关闭或要求鉴权 / IP allowlist |
| 文档版本管理 | `Build` | 按 API 版本生成独立文档 `/docs/v1` / `/docs/v2` |
| 接口变更 Diff | `Build` | 保存历史 OpenAPI 定义，对比生成变更报告 |

### 8.2 API 版本管理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| URL 版本 | `Build` | `router.group("/api/v1")` / `router.group("/api/v2")` |
| Header 版本 | `Build` | 中间件解析 `Accept: application/vnd.api+json;version=2`，路由到对应 handler |
| 旧版本兼容 | `Build` | 新版本中保留旧 handler，标记 `@deprecated` |
| 废弃通知 | `Build` | 响应头添加 `Deprecation: true` 和 `Sunset: <date>` |

---

## 九、性能与稳定性

### 9.1 高并发能力

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 异步 IO | `Bun` | Bun 运行时基于 WebKit JS Core，原生异步 IO |
| Worker Pool | `Wrap` | `new Worker()` 创建线程池，CPU 密集任务 offload |
| Backpressure | `Build` | 队列长度超阈值时返回 `429 Too Many Requests` |

### 9.2 限流与熔断

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Rate Limiter | `Build` | Token Bucket 基于 Redis `INCR` + `EXPIRE` 实现 |
| Circuit Breaker | `Build` | 三状态机（Closed/Open/HalfOpen），错误率超阈值触发熔断 |
| Fallback | `Build` | 熔断后执行 fallback 函数返回兜底数据 |

### 9.3 资源管理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 连接池 | `Wrap` | `Bun.sql` 内部管理，框架层只暴露 max/min 配置 |
| 内存控制 | `Build` | 监控 RSS，超阈值时触发 GC 提示或优雅退出 |
| GC 优化 | `Bun` | Bun 使用 Bun 的 GC 策略，框架层无干预 |

---

## 十、工程化能力

### 10.1 错误处理

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 全局异常捕获 | `Build` | `try/catch` 包裹管线，Filter 链统一处理 |
| 业务错误码 | `Build` | `VentoStackError` 基类，子类定义具体错误码（`USER_NOT_FOUND = 1001`） |
| 错误链 | `Build` | `error.cause` 链式包装，内部日志保留完整调用链 |
| 4xx vs 5xx | `Build` | `ClientError`（400 系列）vs `ServerError`（500 系列），Filter 分别映射；生产响应不返回堆栈、SQL 细节或内部依赖信息 |
| 错误上报 | `Build` | 捕获异常后 HTTP POST 到 Sentry/钉钉 Webhook；内置脱敏过滤器，自动过滤敏感字段后再上报 |

### 10.2 多租户

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Tenant Isolation | `Build` | 所有表加 `tenant_id` 字段，查询自动注入 `WHERE tenant_id = ?` |
| Tenant-aware Context | `Build` | 中间件从请求头/域名解析 `tenantId`，写入 `ctx.tenant` |
| 数据隔离策略 | `Build` | 行级隔离（共享表）/ Schema 隔离 / 数据库隔离，可配置 |
| 缓存与存储命名空间 | `Build` | 缓存 key、对象存储路径、队列 topic、审计记录必须带 tenant namespace，防止跨租户串读 |
| Raw SQL 租户逃生舱口 | `Build` | 允许 `db.raw(...)`，但在多租户应用中必须显式声明 tenant filter 策略；未声明时拒绝执行 |

### 10.3 审计日志

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 操作记录 | `Build` | 中间件记录 `who/when/what/result` 到 `audit_logs` 表 |
| 不可篡改 | `Build` | 每条记录计算 SHA256 hash，链式存储（前一条 hash 作为输入） |
| 查询导出 | `Build` | API 支持按时间/用户/操作类型筛选导出 CSV |

---

## 十一、测试能力

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 单元测试 | `Wrap` | `bun:test` 原生支持，`mock()` / `spyOn()` 替代依赖 |
| 集成测试 | `Build` | `createTestServer(app)` 创建内存服务器，不发真实 HTTP |
| 接口测试 | `Build` | HTTP Client 封装：`request.get("/api/users").expect(200)` |
| 数据库隔离 | `Wrap` | `sql.transaction()` 包裹测试，结束自动 ROLLBACK |
| Test Container | `Build` | 用 `Bun.spawn()` 启动 Docker 容器，测试结束后销毁 |
| Fixture / Factory | `Build` | `Factory(User).create({ email: "test@example.com" })` 快速造数据 |
| 覆盖率 | `Bun` | `bun test --coverage` 原生支持 |
| 安全回归测试 | `Build` | 认证、授权、租户隔离、签名防重放、上传限制、限流、管理端点暴露必须有失败用例覆盖 |

---

## 十二、部署与运维

### 12.1 优雅启停

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 启动前依赖检查 | `Build` | `beforeStart` hook 中 `Promise.all([db.ping(), redis.ping()])` |
| SIGTERM 处理 | `Bun` | `process.on("SIGTERM", () => app.close())` |
| 等待存量请求 | `Build` | 见 1.1 节 `activeRequests` 计数器机制 |
| 热重启 | `Wrap` | `server.reload(newOpts)` 不中断连接升级配置 |

### 12.2 容器化支持

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 最小化 Dockerfile | `Build` | `oven/bun:alpine` 基础镜像，多阶段构建 |
| 非 root 运行 | `Build` | Dockerfile 中 `USER bun` |
| 根文件系统只读 | `Build` | 运行容器默认 `readOnlyRootFilesystem: true`，仅为必要目录挂载可写卷 |
| 禁止提权与能力收缩 | `Build` | `allowPrivilegeEscalation=false`，默认 `drop ALL capabilities`，按需最小增补 |
| seccomp / AppArmor | `Build` | 默认使用 `RuntimeDefault` 或更严格策略，禁止不必要的系统调用面 |
| 资源限制 | `Build` | 显式设置 CPU / memory request 与 limit，避免单实例资源耗尽拖垮节点 |
| 多阶段构建 | `Build` | 阶段1 编译，阶段2 只复制产物，减小镜像体积 |
| 12-Factor | `Build` | 全部配置通过环境变量注入，无配置文件硬编码 |

### 12.3 Kubernetes 集成

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 探针配置 | `Build` | `/health/live` 和 `/health/ready` 自动适配 k8s 格式 |
| startupProbe 分离 | `Build` | 对慢启动依赖使用独立 `startupProbe`，避免在冷启动阶段被误杀 |
| Graceful Shutdown | `Build` | `terminationGracePeriodSeconds` 配合 `app.close()` |
| ConfigMap/Secret | `Build` | 通过环境变量注入，框架配置系统自动读取 |
| NetworkPolicy | `Build` | 默认收紧 ingress/egress，仅允许业务入口、数据库、Redis、DNS 等必要流量 |
| ServiceAccount / RBAC | `Build` | 使用最小权限 ServiceAccount，禁止默认绑定宽权限角色 |

### 12.4 灰度发布 / Feature Flag

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 按用户/流量切换 | `Build` | 请求头 `X-Canary: true` 或 cookie 控制路由 |
| 动态开关 | `Build` | 配置中心热更新 feature flag，不重启生效 |
| A/B Testing | `Build` | 用户 hash 分流到不同版本，记录实验数据 |

---

## 十三、开发体验（DX）

### 13.1 CLI 工具

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 项目初始化 | `Build` | `ventostack create my-app` 复制模板目录，替换变量 |
| 生成用户密码 | `Wrap` | `ventostack password` 调用 `Bun.password.hash()` 生成 |
| 代码生成 | `Build` | `ventostack generate controller User` 读取模板写入文件 |
| 数据库迁移 | `Build` | `ventostack migrate up/down/status` 调用迁移系统 |
| 构建/测试 | `Wrap` | `ventostack build` → `bun build`，`ventostack test` → `bun test` |

### 13.2 热重载

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 文件变更 reload | `Bun` | `bun --hot run ./server.ts` 原生支持 |
| 保留状态 | `Build` | 开发模式下序列化关键状态到内存，热重载后恢复 |

---

## 十四、扩展生态

### 14.1 插件系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 生命周期 Hooks | `Build` | 插件可注册 `beforeStart`/`afterStart`/`beforeStop` |
| 插件注册 | `Build` | `app.use(plugin)`，`plugin.install(app)` 执行初始化 |
| 插件隔离 | `Build` | 插件命名空间隔离，避免全局污染 |
| 插件市场 | `Build` | 官方维护插件列表，npm 包名 `ventostack-plugin-*` |
| 第三方接入规范 | `Build` | 定义 `VentoStackPlugin` 接口，必须符合才能注册 |

### 14.2 Hook / Event 机制

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| beforeRequest / afterResponse | `Build` | 全局 Hook 注册点，每个请求前后触发 |
| 领域事件 | `Build` | 见 6.3 节 |
| 自定义 Hook 点 | `Build` | 框架暴露 `hooks.register("point", handler)` 接口 |

---

## 十五、AI / Agent 能力（核心差异化）

### 15.1 Tool / Command 抽象

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 标准化操作 | `Build` | 定义 `Tool` 接口：`{ name, description, parameters, execute }` |
| Schema 描述 | `Build` | 自动生成 JSON Schema，给 LLM 做 function calling |
| Tool 注册与发现 | `Build` | `toolRegistry.register(tool)`，`toolRegistry.list()` 返回所有可用 tool |

### 15.2 权限沙箱

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 限制 AI 操作 | `Build` | `PermissionSandbox` 白名单/黑名单机制 |
| Command Allowlist | `Build` | 只允许执行已注册的 tool，禁止任意代码执行 |
| 参数 JSON Schema 校验 | `Build` | AI 调用 tool 前校验参数是否符合 JSON Schema，拒绝非法入参 |
| 输出结构校验 | `Build` | 高风险 Tool 或下游系统依赖结构化结果时，执行后做输出 Schema 校验 |
| 独立 Worker 执行 | `Build` | AI 相关任务在独立 Worker 中运行，与主进程隔离，异常不影响主服务；同时限制超时、CPU、内存与并发数 |
| 文件系统 / 网络隔离 | `Build` | Worker 仅允许访问受控工作目录与 allowlist 出站地址，禁止读取 secret 路径或任意联网 |
| 操作审计 | `Build` | 每次 AI 操作记录到审计日志，含输入输出 |
| 审批流 | `Build` | 敏感操作（delete/update）需人工确认后才执行 |

### 15.3 上下文系统

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| Request Context | `Build` | 每次请求创建独立上下文，携带用户/租户/权限信息 |
| User Context | `Build` | 从认证信息提取用户身份，注入 AI 对话 |
| Memory | `Build` | 短期记忆（Redis TTL）+ 长期记忆（数据库存储） |
| 多轮对话状态 | `Build` | `conversation_id` 关联多轮消息，支持上下文窗口管理 |

### 15.4 RAG

| 需求 | 实现方式 | 技术细节 |
|------|---------|---------|
| 知识库管理 | `Build` | 多格式文档解析（PDF/Markdown/TXT），切分 chunk，embedding 向量化 |
| Agent 管理 | `Build` | 配置系统提示词、入参定义、记忆策略、工具绑定 |

---

## 技术选型汇总

| 能力 | Bun 原生 | 自研 | 第三方包 |
|------|---------|------|---------|
| HTTP 服务器 | ✅ `Bun.serve()` | 中间件管线、路由分组 | — |
| 数据库驱动 | ✅ `Bun.sql` | ORM、QueryBuilder、Migration | — |
| Redis | ✅ `Bun.redis` | 缓存策略、分布式锁 | — |
| 密码安全 | ✅ `Bun.password` | — | — |
| CSRF | ✅ `Bun.CSRF` | — | — |
| 定时任务 | ✅ `Bun.cron` | 分布式调度、任务持久化 | — |
| 测试 | ✅ `bun:test` | 测试工具封装 | — |
| 构建 | ✅ `bun build` | — | — |
| 文件 I/O | ✅ `Bun.file()` / `Bun.write()` | — | — |
| Worker | ✅ `Worker` | Worker Pool | — |
| YAML | ✅ `import with { type: "yaml" }` | 配置合并 | — |
| Shell | ✅ `$` from bun | — | — |
| JWT | — | 基于 Web Crypto API | — |
| 参数校验 | — | 轻量 Schema | — |
| 链路追踪 | — | OpenTelemetry SDK | `@opentelemetry/api` |
| 指标监控 | — | Prometheus text format | — |
| API 文档 | — | OpenAPI 生成 | — |
| gRPC | — | HTTP/2 + MessagePack（替代） | — |
| 消息队列 | — | 统一接口 | 各后端适配器 |

---

## 十六、企业级扩展

为大型企业应用场景预留的扩展方向（非核心内置，提供清晰扩展点）：

| 扩展领域 | 说明 |
|---------|------|
| **用户/角色/权限/部门** | 数据模型预留（User / Role / Permission / Department），支持 RBAC 扩展 |
| **Dict（数据字典）** | 动态枚举管理，支持运行时配置下拉选项、状态流转规则 |
| **组织架构树** | 部门/岗位层级结构，支持递归查询与权限继承 |
| **数据权限（行级过滤）** | 基于用户部门、角色、自定义规则的数据行级隔离 |
| **多租户企业级隔离** | 支持 Schema 隔离 / 行级 tenant_id 隔离 / 独立数据库隔离 |
| **审计日志完整链路** | 操作人、操作时间、变更前/后数据、IP、User-Agent 全记录 |
| **审批流引擎扩展点** | 工作流定义（BPMN-like）、节点审批人配置、会签/或签支持 |
| **国际化（i18n）** | 多语言资源管理、请求头 Accept-Language 自动匹配、服务端渲染支持 |
| **数据导入导出** | Excel / CSV 批量导入导出，支持模板下载、数据校验、异步处理大文件 |

---

## 核心原则

1. **Bun 优先** — 能用 `Bun.xxx` 的绝对不用 npm 包
2. **类型安全** — 全链路 TypeScript，零 `any`
3. **无 class** — 服务用工厂函数，不用 class + DI
4. **显式注入** — 依赖通过参数传递，不用字符串定位
5. **编译时安全** — 所有依赖关系在编译时校验
