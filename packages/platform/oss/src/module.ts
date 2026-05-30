import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { StorageAdapter } from "./adapters/storage";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
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
  rbac?: RBAC;
}

export function createOSSModule(deps: OSSModuleDeps): OSSModule {
  const { db, storage, jwt, jwtSecret, rbac } = deps;

  const ossService = createOSSService({ db, storage });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);

  const router = createOSSRoutes(ossService, authMiddleware, perm);

  return {
    services: { oss: ossService },
    router,
    async init() {},
  };
}
