# VentoStack 后端框架 — 技术架构分析

> 总体架构设计文档。基于 Bun 原生能力，定义分层架构、模块边界、目录结构与关键技术选型。

---

## 一、Bun 能力盘点 — 自研 vs 内置

框架设计的核心原则：**能用 Bun 内置就不造轮子，内置不够的才自研扩展**。

| 能力领域 | Bun 内置 | 框架自研 | 说明 |
|---------|---------|---------|------|
| HTTP 服务器 | `Bun.serve()` + 内置路由 | ✅ 中间件管线、路由分组、Context 封装 | Bun 1.2.3+ 已有声明式路由，但缺少中间件洋葱模型和分组 |
| WebSocket | `Bun.serve()` websocket 选项 | ✅ 装饰器封装、房间管理 | 基础能力够用，需要上层抽象 |
| 数据库驱动 | `Bun.sql` (PG/MySQL/SQLite) | ✅ ORM / Query Builder / Migration | Bun.sql 是 raw SQL，需要链式查询构造器 |
| Redis | `Bun.redis` | ✅ 缓存抽象层（L1/L2、标签缓存） | 基础操作够用，需要 cache aside/write through 策略 |
| 密码哈希 | `Bun.password` (argon2id/bcrypt) | — | 直接使用 |
| CSRF | `Bun.CSRF` | — | 直接使用 |
| 哈希/加密 | `Bun.hash` / `Bun.CryptoHasher` | ✅ JWT 签发验证 | 底层能力够用，上层需封装 |
| 定时任务 | `Bun.cron` | ✅ 分布式锁、任务持久化、可观测 | 单实例够用，分布式需扩展 |
| Shell | `$` from bun | — | CLI 工具直接使用 |
| 测试 | `bun:test` | ✅ 测试工具封装（mock service、test container） | 基础测试框架够用 |
| 文件 I/O | `Bun.file()` / `Bun.write()` | — | 直接使用 |
| Worker | `Worker` 线程 | ✅ Worker Pool 管理 | 需要池化封装 |
| 构建 | `bun build` | — | 编译单文件可执行产物 |
| 环境变量 | 自动 `.env` 加载 | ✅ 多环境、类型校验、热更新 | 需要配置系统层 |
| YAML/TOML | 原生 import | ✅ 配置合并、校验 | 解析已有，需要上层管理 |
| S3 | `Bun.s3` | — | 直接使用 |
| DNS | `Bun.dns` | — | 直接使用 |

**结论**：Bun 已覆盖约 60% 的底层能力，框架层主要做**三件事**：
1. **管线封装** — 把 Bun 的原生 API 包装成工程化的中间件/拦截器/过滤器链
2. **领域抽象** — ORM、缓存策略、认证授权、事件系统等 Bun 不提供的上层能力
3. **开发体验** — CLI 脚手架、自动文档、热重载、代码生成

---

## 二、整体架构 — 分层模型

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI / DevTools 层                       │
│  ventostack create / generate / migrate / build / dev          │
├─────────────────────────────────────────────────────────────┤
│                    AI / Agent 层（差异化）                    │
│  Tool Registry │ Permission Sandbox │ Context │ RAG Engine  │
├─────────────────────────────────────────────────────────────┤
│                     应用层（Application）                     │
│  Controller │ Service │ DTO │ Validation │ Middleware        │
├─────────────────────────────────────────────────────────────┤
│                    横切关注点（Cross-Cutting）                 │
│  Auth(JWT/OAuth) │ Logging │ Tracing │ Rate Limit │ Audit   │
├─────────────────────────────────────────────────────────────┤
│                   基础设施层（Infrastructure）                 │
│  ORM │ Cache │ MQ │ Event │ Scheduler │ Storage(S3)         │
├─────────────────────────────────────────────────────────────┤
│                    核心框架层（Core）                          │
│  Router │ Config │ Module Registry │ Lifecycle │ Plugin System │
├─────────────────────────────────────────────────────────────┤
│                    Bun Runtime（底层）                        │
│  Bun.serve() │ Bun.sql │ Bun.redis │ Worker │ Bun.cron      │
└─────────────────────────────────────────────────────────────┘
```

**依赖方向**：上层依赖下层，下层不感知上层。横切关注点通过中间件/拦截器水平注入。

### 信任边界

所有跨边界输入默认不可信，必须经过显式校验、约束和审计：

1. **Edge Boundary**：浏览器、移动端、Webhook 调用方、第三方 API、反向代理
2. **App Boundary**：Router、Middleware、Handler、Validation、Context
3. **Data Boundary**：数据库、Redis、对象存储、消息队列、定时任务
4. **Control Boundary**：CLI、迁移、代码生成、OpenAPI、管理接口
5. **AI Boundary**：Tool Registry、Prompt、Memory、Worker、审批流
6. **Runtime Boundary**：容器、宿主机、Kubernetes、CI/CD、供应链

设计要求：
- 不允许把 Header、Cookie、环境变量、YAML、Prompt、RAG 片段视为天然可信
- trusted proxy、raw SQL、unsafe HTML、管理端点都必须作为显式逃生舱口命名
- 多租户应用中 `tenant` 不是装饰字段，而是权限和数据隔离的前置条件

---

## 三、核心模块设计

### 3.1 核心框架层（Core）

#### 3.1.1 应用入口与生命周期

```typescript
// src/core/app.ts
class VentoStackApp {
  // 生命周期钩子
  beforeStart(hook: LifecycleHook): void;
  afterStart(hook: LifecycleHook): void;
  beforeStop(hook: LifecycleHook): void;

  // 模块注册
  use(module: VentoStackModule): this;

  // 启动/停止
  listen(port: number): Promise<void>;
  close(): Promise<void>;  // graceful shutdown
}
```

**生命周期流程**：

```
构造 App
  → 注册模块（解析依赖图）
  → beforeStart hooks
  → 初始化服务实例（显式组装工厂函数）
  → 连接 DB / Redis / MQ
  → 启动 Bun.serve()
  → afterStart hooks
  → [运行中...]
  → 收到 SIGTERM
  → beforeStop hooks
  → 停止接收新请求
  → 等待存量请求完成（超时可配）
  → 释放连接池
  → 关闭 Bun.serve()
  → 进程退出
```

#### 3.1.2 路由系统

基于 `Bun.serve()` 的声明式路由进行扩展：

```typescript
// 内置路由映射
// Bun.serve({ routes: compiledRoutes })

// 框架层扩展
router.group("/api/v1", (group) => {
  group.use(authMiddleware);
  group.get("/users", UserController.index);
  group.post("/users", UserController.create, { validate: CreateUserDTO });
  group.resource("/posts", PostController);  // RESTful 快捷注册
});
```

**关键设计**：
- 路由编译：启动时将框架路由定义编译为 `Bun.serve()` 的 `routes` 格式，零运行时开销
- 路由元数据：每个路由携带 metadata（handler、middleware chain、validation schema、openapi spec）
- 路由缓存：编译结果缓存，热重载时只重新编译变更部分

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

#### 3.1.3 中间件管线（洋葱模型）

```
Request → [ CORS → Logger → Auth → RateLimit → Handler → Response ]
                                                    ↑
              Response ← [ CORS ← Logger ← Auth ← RateLimit ← ]
```

```typescript
// 中间件接口
interface Middleware {
  handle(ctx: Context, next: () => Promise<void>): Promise<void>;
}

// 内置中间件执行链
class MiddlewarePipeline {
  private stack: Middleware[];

  async execute(ctx: Context, handler: RouteHandler): Promise<Response> {
    // 洋葱模型实现：递归 compose
  }
}
```

**三层模型**：
1. **Middleware** — 最早执行，可中断请求（如 auth 失败）
2. **Interceptor** — 包裹 handler，可变换返回值（如统一包装 code/message/data）
3. **Filter** — 异常捕获与转换（如将业务异常映射为 HTTP 状态码）

#### 3.1.4 上下文对象（Context）

```typescript
interface Context {
  // 请求信息
  readonly request: Request;
  readonly params: Record<string, string>;     // 路径参数
  readonly query: Record<string, string>;      // 查询参数
  readonly headers: Headers;                   // 请求头
  readonly body: unknown;                      // 解析后的 body
  readonly cookies: Bun.CookieMap;             // Bun 内置

  // 响应控制
  respond(response: Response): void;
  json(data: unknown, status?: number): void;
  stream(body: ReadableStream): void;
  redirect(url: string, status?: number): void;

  // 元数据
  readonly state: Map<string, unknown>;        // 中间件间传递数据
  readonly traceId: string;                    // 自动注入
  readonly startTime: number;                  // 请求开始时间

  // 用户信息（auth 中间件注入）
  readonly user?: UserContext;

  // 租户信息（多租户中间件注入）
  readonly tenant?: TenantContext;
}
```

#### 3.1.5 模块注册与服务调用

**设计原则**：不使用 DI 容器，不使用 class，不使用字符串定位。通过显式导入和函数式注册，完全依赖 TypeScript 类型推断。

```typescript
// ── 定义服务（函数式，非 class）──

// app/services/user.service.ts
import { createDatabase } from "ventostack/database";
import { createCache } from "ventostack/cache";

// 服务是一个工厂函数，显式声明依赖
export function createUserService(db: ReturnType<typeof createDatabase>,
                                   cache: ReturnType<typeof createCache>) {
  return {
    async getUser(id: string) {
      const cached = await cache.get(`user:${id}`);
      if (cached) return cached;
      const user = await db.query(User).where(u => u.id.eq(id)).get();
      if (user) await cache.set(`user:${id}`, user, { ttl: 300 });
      return user;
    },

    async createUser(data: CreateUserInput) {
      return db.query(User).insert(data);
    },
  };
}

// ── 应用入口：显式组装 ──

// ventostack.config.ts
import { createApp } from "ventostack/core";
import { createDatabase } from "ventostack/database";
import { createCache } from "ventostack/cache";
import { createUserService } from "./app/services/user.service";
import { createAuthService } from "./app/services/auth.service";

const db = createDatabase(config.database);
const cache = createCache(config.cache);

// 显式注入，类型安全，IDE 可跳转
const userService = createUserService(db, cache);
const authService = createAuthService(db, cache, userService);

export default createApp({
  services: { userService, authService },  // 注册到 app 上，路由可通过 ctx 解引用
  routes: (router) => {
    router.group("/api/v1", (group) => {
      group.get("/users/:id", async (ctx) => {
        const user = await userService.getUser(ctx.params.id);
        ctx.json(user);
      });
    });
  },
});
```

**关键设计**：
- **无 DI 容器** — 依赖通过函数参数显式传递， TypeScript 自动推断类型
- **无字符串定位** — 不存在 `container.get("UserService")` 这种容易拼错的写法
- **无 class** — 全部使用函数和普通对象
- **工厂函数模式** — `createXxx()` 返回服务对象，依赖在创建时注入
- **类型安全** — 所有依赖关系在编译时校验，传错类型直接报错
- **IDE 友好** — 所有引用可通过 Go to Definition 跳转

**模块自动扫描**：

```typescript
// 默认自动扫描 app/modules/ 或 app/**/*.module.ts 下的模块文件
// 模块文件中 export default 导出的模块对象自动注册
// app/modules/user.module.ts
export default defineModule({
  name: "user",
  // disabled: true,  // 标记为 true 时跳过注册
  routes: (router) => { ... },
  services: { ... },
});

// 也支持手动注册（覆盖自动扫描）
import userModule from "./modules/user.module";

export default createApp({
  modules: [userModule],  // 手动注册，优先级高于自动扫描
});
```

#### 3.1.6 配置系统

**核心挑战**：YAML 支持多级嵌套 key（如 `database.connection.pool.max`），而环境变量是扁平的单级 key（如 `DATABASE_CONNECTION_POOL_MAX`）。需要一套统一的映射与合并机制。

**YAML 多级 key 示例**：
```yaml
# config/app.yaml
database:
  host: "localhost"
  port: 5432
  name: "myapp"
  connection:
    pool:
      max: 20
      idle: 5
    timeout: 30000
  replica:
    host: "replica.local"
    port: 5432

redis:
  host: "localhost"
  port: 6379

app:
  name: "VentoStack App"
  debug: false
```

**环境变量映射规则**：

```
YAML 多级 key              环境变量（扁平化）
─────────────────────────────────────────────────────
database.host           →  DATABASE_HOST
database.port           →  DATABASE_PORT
database.connection.pool.max → DATABASE_CONNECTION_POOL_MAX
redis.host              →  REDIS_HOST
app.name                →  APP_NAME
app.debug               →  APP_DEBUG
```

**实现方式**：

```typescript
// 配置加载与合并流程
// 1. 加载 YAML → 得到嵌套对象
// 2. 将环境变量按前缀匹配 → 展开为嵌套路径 → 深度合并到 YAML 对象
// 3. 执行 Schema 校验 → 输出类型安全的配置对象

import { createConfig } from "ventostack/core/config";

// 定义配置 Schema（同时生成类型）
const appConfig = createConfig({
  // Schema 定义：声明 key 的类型、默认值、环境变量映射
  database: {
    host:     { type: "string", default: "localhost", env: "DATABASE_HOST" },
    port:     { type: "number", default: 5432,        env: "DATABASE_PORT" },
    name:     { type: "string", default: "myapp",     env: "DATABASE_NAME" },
    connection: {
      pool: {
        max:    { type: "number", default: 20,  env: "DATABASE_POOL_MAX" },
        idle:   { type: "number", default: 5,   env: "DATABASE_POOL_IDLE" },
      },
      timeout: { type: "number", default: 30000, env: "DATABASE_TIMEOUT" },
    },
  },
  redis: {
    host: { type: "string", default: "localhost", env: "REDIS_HOST" },
    port: { type: "number", default: 6379,        env: "REDIS_PORT" },
  },
});

// ── 自动推导类型（TypeScript）──
type AppConfig = typeof appConfig;
// 自动得到：
// { database: { host: string; port: number; ... connection: { pool: { max: number; ... } } } }

// ── 使用（全类型提示，非字符串）──
appConfig.database.host                // string — IDE 自动补全
appConfig.database.connection.pool.max // number — IDE 自动补全
```

**合并与优先级**（低 → 高）：

```
1. Schema default 值（代码中的 default）
2. config/app.yaml（基础配置）
3. config/app.{env}.yaml（环境覆盖，如 app.prod.yaml）
4. .env 文件（Bun 自动加载）
5. 环境变量（process.env）
6. 命令行参数（--database.host=xxx）
```

**合并实现**：

```typescript
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (isObject(result[key]) && isObject(override[key])) {
      result[key] = deepMerge(result[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

// 环境变量 → 嵌套路径展开
// DATABASE_CONNECTION_POOL_MAX=50 → { database: { connection: { pool: { max: "50" } } } }
function envToNested(prefix: string, env: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix)) continue;
    const path = key.slice(prefix.length).toLowerCase().split("_");
    let target = result;
    for (let i = 0; i < path.length - 1; i++) {
      target[path[i]] ??= {};
      target = target[path[i]];
    }
    target[path[path.length - 1]] = value;
  }
  return result;
}
```

**热更新**：

```typescript
// 监听配置文件变更（利用 Bun.file watch）
config.watch("database.connection.pool.max", (newVal: number) => {
  dbPool.resize(newVal);  // 不重启生效
});
```

**Bun 原生利用**：
- YAML 原生 import：`import cfg from "./config.yaml" with { type: "yaml" }`
- `.env` 自动加载（Bun 内置，无需 dotenv）
- `Bun.file().stat()` 监听文件变更时间
- 无需第三方配置库

---

### 3.2 基础设施层（Infrastructure）

#### 3.2.1 ORM / Query Builder

基于 `Bun.sql` 标签模板字面量构建上层抽象，**全链路类型安全**。

**Model 定义（Schema-first，支持 SQL Comment）**：

```typescript
// app/models/user.model.ts
import { defineModel, column } from "ventostack/database";

export const UserModel = defineModel("users", {
  id:         column.bigint({   primary: true, autoIncrement: true, comment: "用户ID" }),
  email:      column.varchar({  length: 255, unique: true, comment: "登录邮箱" }),
  name:       column.varchar({  length: 100, nullable: true, comment: "用户昵称" }),
  password:   column.varchar({  length: 255, comment: "密码哈希" }),
  age:        column.int({      default: 0, comment: "年龄" }),
  status:     column.enum({     values: ["active", "inactive", "banned"], default: "active", comment: "账号状态" }),
  roleId:     column.bigint({   comment: "角色ID" }),
  createdAt:  column.timestamp({ default: "NOW()", comment: "创建时间" }),
  updatedAt:  column.timestamp({ default: "NOW()", comment: "更新时间" }),
  deletedAt:  column.timestamp({ nullable: true, comment: "软删除时间" }),
}, {
  // 表级选项
  comment: "用户表",
  softDelete: true,     // 自动注入 deletedAt 条件
  timestamps: true,     // 自动维护 createdAt / updatedAt
});

// 自动推导 TypeScript 类型
type User = typeof UserModel.$type;
// { id: number; email: string; name: string | null; password: string; age: number;
//   status: "active" | "inactive" | "banned"; roleId: number;
//   createdAt: Date; updatedAt: Date; deletedAt: Date | null }
```

**生成的 SQL（含 Comment）**：

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(100),
  password    VARCHAR(255) NOT NULL,
  age         INT DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'active',
  role_id     BIGINT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户ID';
COMMENT ON COLUMN users.email IS '登录邮箱';
COMMENT ON COLUMN users.name IS '用户昵称';
COMMENT ON COLUMN users.password IS '密码哈希';
COMMENT ON COLUMN users.age IS '年龄';
COMMENT ON COLUMN users.status IS '账号状态';
COMMENT ON COLUMN users.role_id IS '角色ID';
COMMENT ON COLUMN users.created_at IS '创建时间';
COMMENT ON COLUMN users.updated_at IS '更新时间';
COMMENT ON COLUMN users.deleted_at IS '软删除时间';
```

**类型安全查询**：

```typescript
import { db } from "ventostack/database";

// ✅ where 使用回调，字段名有 IDE 自动补全 + 类型检查
const adults = await db.query(UserModel)
  .where(u => u.age.gt(18))                    // u.age 推断为 number，.gt() 编译为 >
  .where(u => u.status.eq("active"))            // u.status 只允许 "active" | "inactive" | "banned"
  .where(u => u.name.ne(null))                  // 排除 null
  .orderBy(u => u.createdAt, "desc")            // 字段名有补全
  .limit(20)
  .offset(0)
  .list();
// 返回类型自动推导为 User[]

// ✅ select 指定字段，返回类型自动精简
const emails = await db.query(UserModel)
  .select(u => [u.id, u.email])                 // 返回 Pick<User, "id" | "email">[]
  .where(u => u.status.eq("active"))
  .list();

// ✅ 关联查询（类型安全）
const usersWithRoles = await db.query(UserModel)
  .include(u => u.role)                         // 自动 join，类型推导包含 role 字段
  .where(u => u.age.gte(18))
  .list();
// 返回 (User & { role: Role })[]

// ✅ 聚合查询
const stats = await db.query(UserModel)
  .groupBy(u => u.status)
  .count(u => u.id, "total")
  .avg(u => u.age, "avgAge")
  .having(u => u.total.gt(10))
  .list();
// 返回 { status: string; total: number; avgAge: number }[]

// ✅ 插入（字段类型校验）
await db.query(UserModel).insert({
  email: "test@example.com",   // string ✅
  password: hashedPassword,     // string ✅
  age: 25,                      // number ✅
  roleId: 1,                    // number ✅
  // name 省略 → nullable，OK
  // status 省略 → 有 default，OK
});

// ❌ 编译时报错
await db.query(UserModel).insert({
  email: 123,          // Error: number is not assignable to string
  status: "unknown",   // Error: "unknown" is not assignable to "active" | "inactive" | "banned"
});

// ✅ insert / update 返回新对象（含自增 ID）
const newUser = await db.query(UserModel).insert({
  email: "test@example.com",
  password: hashedPassword,
  age: 25,
  roleId: 1,
}, { returning: true });
// newUser: User（包含数据库生成的 id、createdAt 等字段）

const updatedUser = await db.query(UserModel)
  .where(u => u.id.eq(1))
  .update({ name: "New Name" }, { returning: true });
// updatedUser: User（更新后的完整对象）
```

**底层编译过程**：

```typescript
// 用户写的：
db.query(UserModel).where(u => u.age.gt(18)).where(u => u.status.eq("active")).list()

// 编译为 Bun.sql 标签模板：
sql`SELECT * FROM users WHERE age > ${18} AND status = ${"active"} AND deleted_at IS NULL`
```

**分层设计**：
```
Query Builder（类型安全的链式 API）
    ↓ 类型擦除 + 编译
SQL Builder（参数化 SQL 生成）
    ↓ 执行
Bun.sql（标签模板执行，自动参数化）
    ↓ 连接
PostgreSQL / MySQL / SQLite
```

**关键特性**：
- Model 定义：Schema-first，`defineModel()` 返回类型安全的模型对象
- 字段定义：`column.xxx()` 每个字段都有 `comment` 选项，迁移时自动生成 COMMENT
- 查询类型安全：`.where(u => u.字段名.操作符(值))` — 字段名有补全，值类型有校验
- 关联关系：hasOne / hasMany / belongsTo / belongsToMany
- Eager Loading / Lazy Loading
- 事务：基于 `sql.transaction()` 的嵌套事务 + Savepoint
- 软删除：自动注入 `deleted_at IS NULL`
- 乐观锁：version 字段自动检查
- 读写分离：master/replica 配置自动路由

**安全性**：
- SQL 注入防护：所有查询通过 `Bun.sql` 标签模板执行，自动参数化
- 字段白名单：insert/update 只允许 Model 中定义的字段，拒绝未知字段
- 批量操作限制：单次查询结果集大小限制（防止内存溢出）
- 查询超时：每条 SQL 可配置最大执行时间
- 只读模式：只读连接禁止执行写操作

**删除策略**：

```typescript
// 逻辑删除（Model 标记 softDelete: true 时）
await db.query(UserModel).where(u => u.id.eq(1)).delete();
// 自动执行 UPDATE SET deleted_at = NOW() WHERE id = 1

// 物理删除 — 方式一：hardDelete()
await db.query(UserModel).where(u => u.id.eq(1)).hardDelete();
// 直接执行 DELETE FROM users WHERE id = 1

// 物理删除 — 方式二：delete({ force: true })
await db.query(UserModel).where(u => u.id.eq(1)).delete({ force: true });
// 同样直接执行 DELETE

// 查询时自动注入 deleted_at IS NULL（无需手动过滤）
const activeUsers = await db.query(UserModel).list();
// 等价于 SELECT * FROM users WHERE deleted_at IS NULL

// 恢复逻辑删除的数据
await db.query(UserModel).restore({ id: 1 });
// 执行 UPDATE SET deleted_at = NULL WHERE id = 1
```

#### 3.2.2 数据库迁移

```typescript
// migrations/20260417_001_create_users.ts
export function up(sql: Sql) {
  return sql`
    CREATE TABLE users (
      id         BIGSERIAL PRIMARY KEY,
      email      VARCHAR(255) NOT NULL UNIQUE,
      name       VARCHAR(100),
      password   VARCHAR(255) NOT NULL,
      status     VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export function down(sql: Sql) {
  return sql`DROP TABLE users`;
}
```

**CLI 命令**：
```bash
ventostack migrate generate create_users    # 生成迁移文件
ventostack migrate up                       # 执行待执行的迁移
ventostack migrate down                     # 回滚最近一次
ventostack migrate status                   # 查看迁移状态
ventostack migrate seed                     # 执行 seed
```

#### 3.2.3 缓存系统

```typescript
// L1: 内存缓存（Map + TTL）
// L2: Bun.redis

const cache = app.cache;

// 基础操作
await cache.set("user:1", userData, { ttl: 3600 });
const user = await cache.get<User>("user:1");

// 标签缓存
await cache.tags(["user", "team:1"]).set("user:1", data);
await cache.tags(["team:1"]).flush();  // 清除 team:1 下所有缓存

// 分布式锁
const lock = await cache.lock("order:123", { ttl: 30 });
try {
  // 执行业务
} finally {
  await lock.release();
}

// Cache Aside 模式
const data = await cache.remember("hot:data", 300, async () => {
  return await db.query(HotData).list();  // 缓存未命中时回源
});
```

#### 3.2.4 事件系统

```typescript
// 定义事件
const userCreatedEvent = defineEvent<{ userId: string; email: string }>("user.created");

// 监听（注册方式）
on(userCreatedEvent, async (payload) => {
  await emailService.sendWelcome(payload.email);
});

// 派发
await emit(userCreatedEvent, { userId: "1", email: "test@example.com" });
```

**支持模式**：
- 同步派发（默认）：监听器在当前请求上下文内执行
- 异步派发：投递到队列（Redis Stream），后台消费
- 领域事件：与 ORM 集成，model 变更自动触发

#### 3.2.5 后台任务

```typescript
// 基于 Bun.cron + Redis 分布式锁
schedule("0 */5 * * *", async () => {
  await db.query(Session).where(s => s.expiresAt.lt(new Date())).delete();
});

// 延迟任务
await dispatchJob("sendEmail", { to: "user@example.com" }, { delay: 5000 });
```

#### 3.2.6 Webhook 系统

Webhook 系统拆分为两个独立包，通过统一事件模型（`WebhookEvent`）串联入站与出站：

**包依赖关系**：
```
@ventostack/core → @ventostack/webhook → @ventostack/integration
```

**统一事件模型**：
```typescript
interface WebhookEvent {
  id: string;           // 唯一标识
  type: string;         // 事件类型 (e.g. "payment.completed")
  source: string;       // 来源 (provider 名 或 app 名)
  payload: unknown;     // 事件数据
  metadata?: Record<string, unknown>;
  timestamp: number;    // 事件发生时间
}
```

**出站（`@ventostack/webhook`）**：

```typescript
import { createOutboundWebhookManager } from "@ventostack/webhook";

const outbound = createOutboundWebhookManager({
  maxRetries: 5,                // 最大重试次数
  retryInterval: 1000,          // 初始重试间隔（指数退避）
  deliveryTimeout: 10000,       // 单次投递超时
  signatureAlgorithm: "sha256", // HMAC 签名算法
});

// 注册订阅
outbound.subscribe({
  url: "https://partner.example.com/callback",
  secret: "whsec_...",
  events: ["order.created"],
  active: true,
});

// 事件驱动投递
const event: WebhookEvent = { id: "...", type: "order.created", source: "my-app", payload: {...}, timestamp: Date.now() };
await outbound.sendEvent(event);
```

**入站（`@ventostack/webhook` + `@ventostack/integration`）**：

```typescript
import { createInboundVerifier } from "@ventostack/webhook";
import { createStripeVerifier } from "@ventostack/integration";

const verifier = createInboundVerifier({
  provider: createStripeVerifier(),
  config: { secret: "whsec_..." },
});

// 验证并转换为统一事件
const event = await verifier.verifyAndConvert(rawBody, headers);
```

**核心能力**：
- **统一事件模型**：入站/出站统一为 `WebhookEvent`，可与 EventBus 无缝衔接
- **出站投递**：订阅管理、HMAC 签名、指数退避重试、死信队列、投递追踪
- **入站验证**：可扩展 Provider 体系，恒定时间比较，防止时序攻击
- **多平台支持**：`@ventostack/integration` 内置 Stripe / GitHub / 钉钉 / Slack / Shopify / 微信支付 / 支付宝 验证器
- **安全基线**：HMAC 算法白名单（sha256/sha384/sha512）、RSA 非对称验签、时间戳防重放、投递超时控制

---

### 3.3 安全体系

```
┌─────────────────────────────────────────────┐
│              Security Middleware Chain        │
├─────────────────────────────────────────────┤
│  HTTPS Redirect → CORS → CSRF → Rate Limit  │
│       → IP Filter → Input Validation         │
├─────────────────────────────────────────────┤
│           Authentication Layer               │
│  JWT / Session / OAuth2 / API Key / MFA     │
├─────────────────────────────────────────────┤
│           Authorization Layer                │
│  RBAC / ABAC / Resource-level Permission    │
├─────────────────────────────────────────────┤
│           Data Protection                    │
│  bcrypt/argon2id │ AES/RSA │ SQL 参数化      │
│  Bun.password   │ Bun.CryptoHasher │ Bun.sql │
└─────────────────────────────────────────────┘
```

**Bun 原生利用**：
- `Bun.password` — 密码哈希/验证（argon2id / bcrypt）
- `Bun.CSRF` — CSRF token 生成/验证
- `Bun.CryptoHasher` — SHA256 等加密哈希
- `Bun.sql` 标签模板 — 自动参数化查询，防 SQL 注入

**默认安全基线**：
- 所有请求入口必须有 Schema 校验，并带请求体大小、JSON 深度、数组长度、字符串长度限制
- Cookie 认证路径必须同时启用 `HttpOnly`、`Secure`、`SameSite` 与 CSRF Token，WebSocket 握手同样校验来源与 token
- CORS 默认拒绝，禁止 `credentials + * origin` 组合
- 所有出站 HTTP 调用必须经过 SSRF 防护：allowlist、地址分类、审计、超时、限流
- JWT/HMAC/API Key 必须支持算法白名单、密钥版本号、轮换窗口与恒定时间比较
- Refresh Token 与 Access Token 必须分离密钥与生命周期，API Key 必须哈希存储
- 多租户隔离必须覆盖 SQL、缓存 key、对象存储路径、异步任务 key 与审计记录
- 生产环境的 `/docs`、`/openapi.json`、`/metrics`、`/debug`、`/ready` 不得默认裸露

---

### 3.4 可观测性

**可开关设计（默认关闭，零开销）**：

```typescript
// ventostack.config.ts
export default createApp({
  observability: {
    enabled: true,              // 默认 false，开启后才注册中间件和初始化 exporter
    logger: { level: "info", format: "json" },
    tracing: { exporter: "otlp", endpoint: "http://jaeger:4317" },
    metrics: { port: 9090 },
  },
});
```

开启后：

```typescript
// 结构化日志
app.log.info("user login", {
  userId: "123",
  ip: ctx.requestIP,
  traceId: ctx.traceId,        // 自动注入
  duration: Date.now() - ctx.startTime,
});

// OpenTelemetry 集成
app.use(tracingMiddleware({
  exporter: "otlp",
  endpoint: "http://jaeger:4317",
}));

// Prometheus 指标
app.metrics.counter("http_requests_total", { method: "GET", path: "/api/users" });
app.metrics.histogram("http_request_duration_ms", duration, { path: "/api/users" });

// 健康检查
// GET /health/live  → { status: "ok" }
// GET /health/ready → { db: "ok", redis: "ok", mq: "ok" }
```

关闭时（`enabled: false`），所有 `app.log.xxx`、`app.metrics.xxx`、trace 调用均为空操作（no-op），不产生任何运行时开销。

**信息泄露控制**：
- 生产环境错误响应不返回堆栈、SQL 语句、依赖版本、内部拓扑
- 默认脱敏字段至少包括：`password`、`token`、`secret`、`key`、`cookie`、`authorization`、`phone`、`email`、`idcard`
- 默认不采集完整请求体；确需采集时按字段白名单记录
- 指标、文档、调试和健康检查端点必须按环境、网络边界或鉴权策略限制暴露

---

### 3.5 AI / Agent 能力

```typescript
// Tool 定义（Schema 描述给 LLM 使用）
const queryUserTool = tool({
  name: "query_user",
  description: "根据 ID 查询用户信息",
  parameters: {
    id: { type: "string", description: "用户ID" },
  },
  execute: async ({ id }) => {
    return await db.query(User).where("id", id).get();
  },
});

// 权限沙箱
const sandbox = new PermissionSandbox({
  allow: ["query_user", "query_order"],  // 白名单
  deny: ["delete_user", "exec_sql"],      // 黑名单
  audit: true,                             // 操作审计
});

// 上下文管理
const agentCtx = new AgentContext({
  memory: new MemoryStore(),  // 短期 + 长期记忆
  user: currentUser,
  tenant: currentTenant,
});
```

**AI 边界约束**：
- Tool 必须显式注册，参数必须做 Schema 校验，必要时输出也要做结构校验
- 默认禁止任意 shell、任意文件访问、任意 SQL，所有高危 Tool 必须走审批流
- Worker 隔离不仅是“独立线程”，还必须带超时、CPU、内存、文件系统、网络出站限制
- Prompt、Memory、RAG 内容视为不可信输入，不能直接穿透到执行面
- 每次 Tool 调用都要记录发起者、参数摘要、结果摘要、耗时与审批链

---

### 3.6 运行时与供应链隔离

运行时与部署层默认安全基线：

- 容器内非 root 运行，根文件系统只读，`allowPrivilegeEscalation=false`
- 默认 `drop ALL capabilities`，按需最小增补，`seccomp=RuntimeDefault`
- 仅挂载必要的可写目录，例如 `/tmp`
- 显式设置 CPU / Memory request 与 limit，避免资源耗尽影响同节点工作负载
- 仅信任配置过的反向代理 IP/CIDR，不能盲信 `X-Forwarded-*`
- 使用 NetworkPolicy 和最小 ServiceAccount/RBAC 限制网络与控制面访问

供应链要求：

- `bun.lock` 必须提交并参与评审
- 第三方依赖默认固定版本，新增依赖必须说明 Bun 内置能力为何不足
- `postinstall`、动态下载二进制、远程脚本执行都需要单独审查
- 构建链需要具备依赖漏洞扫描和产物溯源能力

---

## 四、目录结构

**Bun Workspaces 多包架构**：

```toml
# bunfig.toml（根目录）
[install]
registry = "https://registry.npmjs.org"

[run]
# 开发时自动加载 .env
env = ".env"
```

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

```
ventostack/
├── packages/                          # Monorepo 结构（Bun workspaces 管理）
│   ├── core/                          # 核心框架层
│   │   ├── src/
│   │   │   ├── app.ts                 # VentoStackApp 入口
│   │   │   ├── router/                # 路由系统
│   │   │   │   ├── router.ts          # 路由定义与编译
│   │   │   │   ├── group.ts           # 路由分组
│   │   │   │   └── matcher.ts         # 路由匹配与优先级
│   │   │   ├── middleware/             # 中间件系统
│   │   │   │   ├── pipeline.ts        # 洋葱模型管线
│   │   │   │   ├── context.ts         # 请求上下文
│   │   │   │   └── builtin/           # 内置中间件
│   │   │   │       ├── cors.ts
│   │   │   │       ├── logger.ts
│   │   │   │       ├── rate-limit.ts
│   │   │   │       ├── compress.ts
│   │   │   │       └── timeout.ts
│   │   │   ├── config/                # 配置系统
│   │   │   │   ├── manager.ts         # 配置管理器
│   │   │   │   ├── loader.ts          # 多源加载
│   │   │   │   └── schema.ts          # Schema 校验
│   │   │   ├── registry/              # 模块注册表
│   │   │   │   ├── module.ts          # 模块定义与注册
│   │   │   │   └── resolver.ts        # 依赖解析（编译时校验）
│   │   │   ├── lifecycle/             # 应用生命周期
│   │   │   │   ├── hooks.ts           # beforeStart / afterStart / beforeStop
│   │   │   │   └── shutdown.ts        # 优雅关闭
│   │   │   ├── plugin/                # 插件系统
│   │   │   │   ├── registry.ts        # 插件注册
│   │   │   │   ├── loader.ts          # 插件加载
│   │   │   │   └── hooks.ts           # 插件生命周期
│   │   │   ├── error/                 # 错误处理
│   │   │   │   ├── errors.ts          # 业务错误码体系
│   │   │   │   ├── filter.ts          # 全局异常过滤器
│   │   │   │   └── reporter.ts        # 错误上报
│   │   │   └── types.ts               # 核心类型定义
│   │   └── package.json
│   │
│   ├── database/                      # 数据访问层
│   │   ├── src/
│   │   │   ├── orm/                   # ORM / Query Builder
│   │   │   │   ├── model.ts           # Model 基类
│   │   │   │   ├── query-builder.ts   # 链式查询构造器
│   │   │   │   ├── relations.ts       # 关联关系
│   │   │   │   ├── serializer.ts      # 序列化
│   │   │   │   └── schema.ts          # defineModel / column / relation 等
│   │   │   ├── migration/             # 迁移系统
│   │   │   │   ├── runner.ts          # 迁移执行器
│   │   │   │   ├── generator.ts       # 迁移文件生成
│   │   │   │   └── templates/         # 迁移模板
│   │   │   ├── connection/            # 连接管理
│   │   │   │   ├── pool.ts            # 连接池
│   │   │   │   ├── manager.ts         # 多数据源管理
│   │   │   │   └── rw-split.ts        # 读写分离路由
│   │   │   └── seed/                  # 数据填充
│   │   └── package.json
│   │
│   ├── cache/                         # 缓存系统
│   │   ├── src/
│   │   │   ├── manager.ts             # 缓存管理器
│   │   │   ├── drivers/               # 缓存驱动
│   │   │   │   ├── memory.ts          # L1 内存缓存
│   │   │   │   └── redis.ts           # L2 Redis 缓存（基于 Bun.redis）
│   │   │   ├── lock.ts                # 分布式锁
│   │   │   ├── tags.ts                # 标签缓存
│   │   │   └── strategies.ts          # Cache Aside / Write Through
│   │   └── package.json
│   │
│   ├── auth/                          # 认证授权
│   │   ├── src/
│   │   │   ├── authentication/        # 认证
│   │   │   │   ├── jwt.ts             # JWT 签发/验证/刷新/吊销
│   │   │   │   ├── session.ts         # Session 认证
│   │   │   │   ├── oauth2.ts          # OAuth2.0 / OIDC
│   │   │   │   ├── api-key.ts         # API Key
│   │   │   │   └── mfa.ts             # 多因素认证
│   │   │   ├── authorization/         # 授权
│   │   │   │   ├── rbac.ts            # RBAC
│   │   │   │   ├── abac.ts            # ABAC
│   │   │   │   ├── guard.ts           # 权限守卫
│   │   │   │   └── policy.ts          # 策略引擎
│   │   │   └── security/              # 安全防护
│   │   │       ├── input.ts           # 输入校验
│   │   │       ├── xss.ts             # XSS 防护
│   │   │       └── ip-filter.ts       # IP 黑白名单
│   │   └── package.json
│   │
│   ├── events/                        # 事件与任务系统
│   │   ├── src/
│   │   │   ├── dispatcher.ts          # 事件派发器
│   │   │   ├── listener.ts            # 监听器注册
│   │   │   ├── domain-events.ts       # 领域事件
│   │   │   ├── scheduler.ts           # 定时任务（基于 Bun.cron）
│   │   │   ├── queue/                 # 队列抽象
│   │   │   │   ├── driver.ts          # 队列驱动接口
│   │   │   │   ├── redis-stream.ts    # Redis Stream 实现
│   │   │   │   └── job.ts             # Job 定义与执行
│   │   │   └── distributed/           # 分布式协调
│   │   │       └── lock.ts            # 分布式锁（基于 Redis）
│   │   └── package.json
│   │
│   ├── webhook/                       # Webhook 出站投递与入站验证
│   │   ├── src/
│   │   │   ├── types.ts              # 统一事件模型（WebhookEvent）
│   │   │   ├── outbound.ts           # 出站管理器（订阅、签名、重试、死信）
│   │   │   ├── inbound.ts            # 入站验证器（Provider 体系）
│   │   │   └── crypto.ts             # 加密工具（HMAC、RSA、恒定时间比较）
│   │   └── package.json
│   │
│   ├── integration/                   # 第三方平台 Webhook 验证器
│   │   ├── src/
│   │   │   └── providers/
│   │   │       ├── stripe.ts          # Stripe（HMAC-SHA256，时间戳，密钥轮换）
│   │   │       ├── github.ts          # GitHub（HMAC-SHA256）
│   │   │       ├── dingtalk.ts        # 钉钉（HMAC-SHA256，URL query 签名）
│   │   │       ├── slack.ts           # Slack（HMAC-SHA256，时间戳）
│   │   │       ├── shopify.ts         # Shopify（HMAC-SHA256，Base64）
│   │   │       ├── wechat-pay.ts      # 微信支付（RSA-SHA256，非对称验签）
│   │   │       └── alipay.ts          # 支付宝（RSA2，非对称验签）
│   │   └── package.json
│   │
│   ├── observability/                 # 可观测性
│   │   ├── src/
│   │   │   ├── logger/                # 日志系统
│   │   │   │   ├── logger.ts          # 结构化日志
│   │   │   │   ├── formatters.ts      # JSON / Text 格式化
│   │   │   │   ├── transports.ts      # 输出目标（console/file/remote）
│   │   │   │   └── redact.ts          # 敏感字段脱敏
│   │   │   ├── tracing/               # 链路追踪
│   │   │   │   ├── opentelemetry.ts   # OTel 集成
│   │   │   │   ├── context.ts         # TraceContext 传播
│   │   │   │   └── middleware.ts      # 自动追踪中间件
│   │   │   ├── metrics/               # 指标监控
│   │   │   │   ├── prometheus.ts      # Prometheus 格式
│   │   │   │   ├── counters.ts        # 内置指标
│   │   │   │   └── endpoint.ts        # /metrics 接口
│   │   │   └── health/                # 健康检查
│   │   │       ├── live.ts            # 存活探针
│   │   │       └── ready.ts           # 就绪探针
│   │   └── package.json
│   │
│   ├── openapi/                       # API 文档
│   │   ├── src/
│   │   │   ├── generator.ts           # OpenAPI 3.0 文档生成
│   │   │   ├── schema.ts              # 路由注解与 OpenAPI 元数据
│   │   │   ├── ui.ts                  # Swagger UI / Redoc
│   │   │   └── versioning.ts          # API 版本管理
│   │   └── package.json
│   │
│   ├── ai/                            # AI / Agent 能力
│   │   ├── src/
│   │   │   ├── tools/                 # Tool 系统
│   │   │   │   ├── registry.ts        # Tool 注册表
│   │   │   │   ├── schema.ts          # Tool Schema 描述
│   │   │   │   └── executor.ts        # Tool 执行器
│   │   │   ├── sandbox/               # 权限沙箱
│   │   │   │   ├── permission.ts      # 权限控制
│   │   │   │   └── audit.ts           # 操作审计
│   │   │   ├── context/               # 上下文管理
│   │   │   │   ├── agent-context.ts   # Agent 上下文
│   │   │   │   └── memory.ts          # 短期/长期记忆
│   │   │   └── rag/                   # RAG 能力
│   │   │       ├── embedding.ts       # 文本向量化
│   │   │       ├── chunking.ts        # 文档分块
│   │   │       └── retrieval.ts       # 检索
│   │   └── package.json
│   │
│   ├── cli/                           # CLI 工具
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── create.ts          # ventostack create
│   │   │   │   ├── generate.ts        # ventostack generate
│   │   │   │   ├── migrate.ts         # ventostack migrate
│   │   │   │   ├── build.ts           # ventostack build
│   │   │   │   ├── dev.ts             # ventostack dev（热重载）
│   │   │   │   └── password.ts        # ventostack password（生成密码）
│   │   │   └── templates/             # 项目模板
│   │   │       ├── app/
│   │   │       ├── controller/
│   │   │       ├── service/
│   │   │       └── migration/
│   │   └── package.json
│   │
│   └── testing/                       # 测试工具
│       ├── src/
│       │   ├── test-server.ts         # 内置测试服务器
│       │   ├── mock-service.ts        # Service Mock
│       │   ├── http-client.ts         # HTTP 测试客户端
│       │   ├── database.ts            # 数据库测试隔离
│       │   └── fixtures/              # Fixture / Factory
│       └── package.json
│
├── examples/                          # 示例项目
│   ├── blog-api/
│   ├── e-commerce/
│   └── ai-agent/
│
├── docs/                              # 文档
├── bunfig.toml                        # Bun 配置
├── package.json                       # Monorepo root
└── tsconfig.json
```

---

## 五、模块依赖关系

```
                    cli
                     │
                     ▼
            ┌──── openapi ────┐
            │                  │
     ┌── ai ──┐          ┌── auth ──┐
     │         │          │          │
     │         ▼          ▼          │
     │    ┌── events ── observability │
     │    │                          │
     │    ▼                          │
     │  cache                        │
     │    │                          │
     │    ▼                          │
     │  database                     │
     │    │                          │
     │    ▼          ▼               │
     └──────► core ◄────────────────┘
               │
               ▼
          Bun Runtime
```

**依赖规则**：
- `core` 不依赖任何业务包，只依赖 Bun
- `database`、`cache`、`events`、`observability` 只依赖 `core`
- `auth`、`openapi`、`ai` 可依赖 `core` + 基础设施包
- `cli` 依赖所有包（用于代码生成和项目初始化）
- **禁止循环依赖**：构建时 DAG 校验

---

## 六、应用项目结构（用户视角）

ventostack create 生成的项目）：

```
my-app/
├── app/
│   ├── controllers/            # 控制器
│   │   └── user.controller.ts
│   ├── services/               # 业务逻辑
│   │   └── user.service.ts
│   ├── models/                 # 数据模型
│   │   └── user.model.ts
│   ├── middleware/             # 自定义中间件
│   │   └── auth.ts
│   ├── events/                 # 事件监听器
│   │   └── user.events.ts
│   ├── jobs/                   # 后台任务
│   │   └── email.job.ts
│   └── policies/               # 授权策略
│       └── user.policy.ts
├── config/
│   ├── app.yaml                # 主配置
│   ├── app.dev.yaml            # 开发环境覆盖
│   ├── app.test.yaml           # 测试环境覆盖
│   └── app.prod.yaml           # 生产环境覆盖
├── database/
│   ├── migrations/             # 迁移文件
│   └── seeds/                  # 种子数据
├── routes/
│   └── index.ts                # 路由注册入口
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── public/                     # 静态文件
├── .env                        # 环境变量
├── ventostack.config.ts           # 框架配置入口
├── package.json
└── tsconfig.json
```

---

## 七、关键技术选型

| 领域 | 选型 | 理由 |
|------|------|------|
| 运行时 | **Bun ≥ 1.2** | 原生 TS、内置 DB/Redis/S3/测试，性能远超 Node |
| HTTP | **Bun.serve()** | 内置路由（1.2.3+），WebSocket 同端口，零依赖 |
| 数据库驱动 | **Bun.sql** | 标签模板自动参数化，PG/MySQL/SQLite 统一 API |
| 缓存驱动 | **Bun.redis** | 官方内置，pipeline/pub-sub 都支持 |
| 密码安全 | **Bun.password** | argon2id 默认，一行代码 hash/verify |
| CSRF | **Bun.CSRF** | 官方内置 |
| 定时任务 | **Bun.cron** | 单实例用原生，分布式加 Redis 锁 |
| 测试 | **bun:test** | 原生测试框架，速度快，mock/spy/snapshot 全支持 |
| 构建 | **bun build** | 原生打包，支持编译为单文件可执行产物 |
| 包管理 | **bun install** | 比 npm 快 25x，workspaces 原生支持 |
| 热重载 | **bun --hot** | 原生支持，代码变更不重启进程 |
| YAML 配置 | **Bun import** | `import from "x.yaml" with { type: "yaml" }` |
| 参数校验 | **自研** | 参考 Valibot 设计理念（轻量、tree-shakeable、类型推导），自研实现不引入依赖 |
| JWT | **自研** | 基于 Web Crypto API，不引入 jsonwebtoken |
| ORM | **自研** | 基于 Bun.sql 标签模板，深度集成 |
| 链路追踪 | **OpenTelemetry SDK** | 行业标准，接入 Jaeger/Tempo |
| 指标 | **自研** | Prometheus text format 输出，不引入 prom-client |
| API 文档 | **自研** | 从装饰器/路由元数据自动生成 OpenAPI 3.0 |

---

## 八、性能策略

### 8.1 启动时优化
- 路由编译为 Bun.serve() 原生格式，运行时零匹配开销
- 服务实例创建后缓存，避免重复初始化
- 配置文件启动时一次性加载合并，运行时不读文件

### 8.2 运行时优化
- 中间件管线预编译为函数调用链，避免动态分发
- ORM 查询编译为 `sql` 标签模板，利用 Bun 的预编译优化
- Worker Pool 处理 CPU 密集任务（图片处理、加密等）
- 响应直接返回 `Response` 对象，零拷贝

### 8.3 Bun 专项优化
- 使用 `bun --hot` 开发，不重启进程
- 使用 `bun build --compile` 生产部署，单文件可执行
- 使用 `bun --smol` 低内存模式适配小规格容器
- 利用 Bun 原生 `import` 加速冷启动（无 CJS 兼容开销）

---

## 九、与 Bun 生态的协同

```
VentoStack 框架
├── 完全拥抱 Bun 原生 API，不包装 Node.js polyfill
├── 利用 Bun.serve() 路由系统，在其上扩展中间件
├── 利用 Bun.sql 标签模板，在其上构建 ORM
├── 利用 Bun.redis，在其上构建缓存策略
├── 利用 Bun.cron，在其上构建分布式任务调度
├── 利用 bun:test，在其上构建测试工具
├── 利用 bun build，支持编译为单文件部署
├── 利用 Bun Worker，提供 Worker Pool
├── 支持 bunfig.toml 作为框架配置补充
└── 所有包通过 Bun workspaces 管理（monorepo）
```

**核心立场** VentoStack 不是"也支持 Bun 的 Node.js 框架"，而是"Bun 原生框架"。任何 Node.js polyfill 都不应出现在框架代码中。

---

## 十、企业级扩展考虑

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
