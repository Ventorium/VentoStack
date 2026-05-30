/**
 * @ventostack/scheduler - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { Scheduler } from "@ventostack/events";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createSchedulerRoutes } from "./routes/scheduler";
import { createSchedulerService } from "./services/scheduler";
import type { JobHandlerMap } from "./services/scheduler";

export interface SchedulerModule {
  services: {
    scheduler: ReturnType<typeof createSchedulerService>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface SchedulerModuleDeps {
  db: Database;
  scheduler: Scheduler;
  handlers: JobHandlerMap;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createSchedulerModule(deps: SchedulerModuleDeps): SchedulerModule {
  const { db, scheduler, handlers, jwt, jwtSecret, rbac } = deps;

  const schedulerService = createSchedulerService({ db, scheduler, handlers });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);

  const router = createSchedulerRoutes(schedulerService, authMiddleware, perm);

  return {
    services: { scheduler: schedulerService },
    router,
    async init() {
      const result = await schedulerService.list({ status: 1, page: 1, pageSize: 1000 });
      for (const job of result.items) {
        await schedulerService.start(job.id);
      }
    },
  };
}
