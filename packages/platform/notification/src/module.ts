/**
 * @ventostack/notify - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createNotificationRoutes } from "./routes/notification";
import { createNotificationService } from "./services/notification";
import type { NotificationService, NotifyChannel } from "./services/notification";

export interface NotificationModule {
  services: {
    notification: NotificationService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface NotificationModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  channels: Map<string, NotifyChannel>;
}

export function createNotificationModule(deps: NotificationModuleDeps): NotificationModule {
  const { db, jwt, jwtSecret, rbac, channels } = deps;

  const notificationService = createNotificationService({ db, channels });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);

  const router = createNotificationRoutes(notificationService, authMiddleware, perm);

  return {
    services: { notification: notificationService },
    router,
    async init() {},
  };
}
