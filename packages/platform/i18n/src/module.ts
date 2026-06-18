/**
 * @ventostack/i18n - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createI18nRoutes } from "./routes/i18n";
import { createI18nService } from "./services/i18n";
import type { I18nService } from "./services/i18n";

export interface I18nModule {
  services: {
    i18n: I18nService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface I18nModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createI18nModule(deps: I18nModuleDeps): I18nModule {
  const { db, jwt, jwtSecret, rbac } = deps;

  const i18nService = createI18nService({ db });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);

  const router = createI18nRoutes(i18nService, authMiddleware, perm);

  return {
    services: { i18n: i18nService },
    router,
    async init() {},
  };
}
