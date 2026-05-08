/**
 * @ventostack/gen - 模块聚合
 */

import type { Database, SqlExecutor, TableSchemaInfo } from "@ventostack/database";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import { createGenService } from "./services/gen";
import { createGenRoutes } from "./routes/gen";
import { createAuthMiddleware } from "./middlewares/auth-guard";

export interface GenModule {
  services: {
    gen: ReturnType<typeof createGenService>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface GenModuleDeps {
  db: Database;
  /** Raw executor needed for readTableSchema */
  executor: SqlExecutor;
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createGenModule(deps: GenModuleDeps): GenModule {
  const { db, executor, readTableSchema, jwt, jwtSecret, rbac } = deps;

  const genService = createGenService({ db, executor, readTableSchema });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);

  const perm = (resource: string, action: string) => {
    return async (ctx: any, next: any) => {
      const user = ctx.user as { roles: string[] } | undefined;
      if (!user) {
        return new Response(JSON.stringify({ code: 401, message: "未登录" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (rbac) {
        const allowed = user.roles.some((r: string) => rbac.hasPermission(r, resource, action));
        if (!allowed) {
          return new Response(JSON.stringify({ code: 403, message: `无权限：${resource}:${action}` }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
      }
      return next();
    };
  };

  const router = createGenRoutes(genService, authMiddleware, perm as any);

  return {
    services: { gen: genService },
    router,
    async init() {},
  };
}
