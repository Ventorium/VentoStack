---
order: 3
title: 项目结构
description: VentoStack 推荐的项目结构和文件组织方式
---

## 推荐结构

```
my-ventostack-app/
  src/
    main.ts              - 应用入口
    app.ts               - 应用组装（依赖注入）
    config.ts            - 应用配置
    routes/              - 路由模块
      index.ts           - 路由注册入口
      users.ts
      auth.ts
      health.ts
    middleware/          - 中间件
      auth.ts
      logger.ts
      validation.ts
    services/            - 业务逻辑
      user-service.ts
      auth-service.ts
    events/              - 领域事件
      user-events.ts
    openapi.ts           - OpenAPI 文档配置
  package.json
  tsconfig.json
  bunfig.toml
```

## 入口文件

`src/main.ts` 负责启动应用：

```typescript
import { createExampleApp } from "./app";

const { app } = await createExampleApp({
  db: createDatabase({ url: process.env.DATABASE_URL! }),
});

await app.listen();
```

`src/app.ts` 负责组装所有模块：

```typescript
import { createApp } from "@ventostack/core";
import { createLogger } from "@ventostack/observability";
import { registerRoutes } from "./routes";
import { requestLogger, errorHandler } from "./middleware/common";
import { config } from "./config";

export interface CreateAppOptions {
  db: Database;
  config?: Partial<AppConfig>;
}

export async function createExampleApp(options: CreateAppOptions) {
  const logger = createLogger({ level: "info" });
  const app = createApp({ port: config.port });

  app.use(errorHandler({ logger }));
  app.use(requestLogger({ logger }));

  registerRoutes({ router: app.router, userService, authService });

  return { app, db: options.db, logger };
}
```

## 路由模块

路由文件接收依赖并注册路由：

```typescript
// src/routes/users.ts
import type { Router } from "@ventostack/core";
import type { createUserService } from "../services/user-service";

export interface UserRoutesDeps {
  userService: ReturnType<typeof createUserService>;
}

export function registerUserRoutes(router: Router, deps: UserRoutesDeps): void {
  const { userService } = deps;

  router.get("/api/users", async (ctx) => {
    const users = await userService.listUsers();
    return ctx.json({ data: users });
  });

  router.get("/api/users/:id", async (ctx) => {
    const id = ctx.params["id"]!;
    const user = await userService.getUserById(id);
    return ctx.json(user);
  });
}
```

路由入口统一注册：

```typescript
// src/routes/index.ts
import type { Router } from "@ventostack/core";
import { registerUserRoutes } from "./users";
import { registerAuthRoutes } from "./auth";

export interface RegisterRoutesDeps {
  router: Router;
  userService: ReturnType<typeof createUserService>;
  authService: ReturnType<typeof createAuthService>;
}

export function registerRoutes(deps: RegisterRoutesDeps): void {
  registerUserRoutes(deps.router, { userService: deps.userService });
  registerAuthRoutes(deps.router, { authService: deps.authService });
}
```

## 配置文件

```typescript
// src/config.ts
export interface AppConfig {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: number;
  env: string;
}

export const defaultConfig: AppConfig = {
  port: 3000,
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtExpiresIn: 7 * 24 * 60 * 60,
  env: process.env.NODE_ENV || "development",
};
```

## Monorepo 结构

对于大型项目，推荐使用 Bun workspaces：

```
my-project/
  apps/
    api/                 - 后端 API
    docs/                - 文档站点
  packages/
    shared/              - 共享类型和工具
    ui/                  - 前端组件库
  package.json           - 根 package.json（workspaces 配置）
  bun.lock
```

根 `package.json`：

```json
{
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun --hot apps/api/src/main.ts",
    "test": "bun test"
  }
}
```
