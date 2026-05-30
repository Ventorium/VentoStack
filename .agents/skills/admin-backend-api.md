---
name: admin-backend-api
description: |
  开发或修改 apps/admin/api 管理后台后端时必须遵循的规范。
  涵盖 Composition Root 装配、中间件顺序、环境配置、数据库迁移、认证引擎组装。
---

# Admin Backend API — AI Agent 编码规范

## 核心原则

1. **Composition Root**: `app.ts` 是唯一装配点，禁止在其他文件创建基础设施。
2. **中间件顺序敏感**: 全局中间件必须按正确顺序注册。
3. **可观测性包装**: executor、cache、redis client 必须包装追踪。
4. **环境隔离**: 配置通过 `env.ts` 统一读取，禁止直接访问 `process.env`。

## 文件结构

```
apps/admin/api/src/
├── index.ts          # 入口：顶层错误边界
├── app.ts            # 装配：基础设施 → 认证 → Platform → 中间件 → 路由
├── config/
│   └── index.ts      # 环境配置（env.ts）
├── auth/
│   └── index.ts      # 认证引擎组装
├── cache/
│   └── index.ts      # 缓存实例创建
├── database/
│   ├── index.ts      # 数据库连接 + 迁移/种子执行
│   ├── migrations.ts # 迁移注册列表
│   ├── migrations/   # 迁移文件
│   └── seeds/        # 种子文件
├── storage/
│   └── index.ts      # 对象存储适配器
└── logger.ts         # 日志配置
```

## 中间件顺序（必须严格遵守）

```typescript
// 1. 请求追踪
app.use(requestId());
app.use(createTracingMiddleware(tracer, { traceStore }));

// 2. CORS
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));

// 3. 日志
app.use(requestLogger());

// 4. 健康检查（无需认证）
app.use(healthRouter);
app.use(metricsRouter);

// 5. OpenAPI（无需认证）
setupOpenAPI(app, ...);

// 6. 限流
app.use(rateLimit({ ... }));

// 7. 认证
app.use(authMiddleware);

// 8. 权限（路由级，在 module 中）

// 9. 平台路由
app.use(platform.router);

// 10. 错误处理（必须最后）
app.use(errorHandler());
```

## 认证引擎组装（auth/index.ts）

```typescript
export function assembleAuthEngines(redisClient?: RedisClient) {
  const jwt = createJWT({ secret: env.JWT_SECRET, algorithm: "HS256" });
  const passwordHasher = createPasswordHasher();
  const rbac = createRBAC();
  // ... 其他引擎
  return { jwt, jwtSecret: env.JWT_SECRET, passwordHasher, rbac, ... };
}
```

## 环境配置（config/index.ts）

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("3000"),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.string().optional(),
  ALLOWED_ORIGINS: z.string().transform((s) => s.split(",")),
  WEBAUTHN_RP_ID: z.string().optional(),
  WEBAUTHN_RP_NAME: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

## 数据库迁移注册

新增迁移必须在 `apps/admin/api/src/database/migrations.ts` 中注册：

```typescript
import { createSysXxx } from "@ventostack/system/migrations/NNN_create_sys_xxx";

export const migrations = [
  // ... 已有迁移
  createSysXxx,
];
```

## 禁止事项

- ❌ 在 handler 中直接访问 `process.env`
- ❌ 在中间件顺序中把 `errorHandler` 放在前面
- ❌ 在 `app.ts` 之外创建数据库连接
- ❌ 跳过 `env` schema 校验直接使用环境变量
- ❌ 生产环境暴露 `/docs` 或 `/metrics` 无权限控制
