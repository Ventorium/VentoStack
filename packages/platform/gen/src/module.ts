/**
 * @ventostack/gen - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database, SqlExecutor, TableSchemaInfo } from "@ventostack/database";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createGenRoutes } from "./routes/gen";
import { createGenService } from "./services/gen";

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
  const perm = createPermMiddleware(rbac);

  const router = createGenRoutes(genService, authMiddleware, perm);

  return {
    services: { gen: genService },
    router,
    async init() {},
  };
}
