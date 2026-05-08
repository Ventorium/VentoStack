/**
 * @ventostack/scheduler - 模块聚合
 */

import type { Database } from "@ventostack/database";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Scheduler } from "@ventostack/events";
import type { Router } from "@ventostack/core";
import { createSchedulerService } from "./services/scheduler";
import type { JobHandlerMap } from "./services/scheduler";
import { createSchedulerRoutes } from "./routes/scheduler";
import { createAuthMiddleware } from "./middlewares/auth-guard";

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

  const perm = (resource: string, action: string) => {
    return async (ctx: any, next: any) => {
      const user = ctx.user as { roles: string[] } | undefined;
      if (!user) {
        return new Response(
          JSON.stringify({ code: 401, message: "未登录" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (rbac) {
        const allowed = user.roles.some((r: string) => rbac.hasPermission(r, resource, action));
        if (!allowed) {
          return new Response(
            JSON.stringify({ code: 403, message: `无权限：${resource}:${action}` }),
            { status: 403, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return next();
    };
  };

  const router = createSchedulerRoutes(schedulerService, authMiddleware, perm as any);

  return {
    services: { scheduler: schedulerService },
    router,
    async init() {
      // Auto-start all running jobs from DB
      const result = await schedulerService.list({ status: 1, page: 1, pageSize: 1000 });
      for (const job of result.items) {
        await schedulerService.start(job.id);
      }
    },
  };
}
