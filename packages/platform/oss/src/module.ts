import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { StorageAdapter } from "./adapters/storage";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createOSSRoutes } from "./routes/oss";
import { createOSSService } from "./services/oss";

export interface OSSModule {
  services: {
    oss: ReturnType<typeof createOSSService>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface OSSModuleDeps {
  db: Database;
  storage: StorageAdapter;
  jwt: JWTManager;
  jwtSecret: string;
  /** RBAC 管理器实例（必填，避免权限校验被静默跳过） */
  rbac: RBAC;
}

export function createOSSModule(deps: OSSModuleDeps): OSSModule {
  const { db, storage, jwt, jwtSecret, rbac } = deps;

  const ossService = createOSSService({ db, storage });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  // rbac 必填：无 RBAC 实例时直接失败，禁止静默跳过权限检查
  const perm = createPermMiddleware(rbac);

  const router = createOSSRoutes(ossService, authMiddleware, perm);

  return {
    services: { oss: ossService },
    router,
    async init() {},
  };
}
