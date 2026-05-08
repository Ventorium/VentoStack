/**
 * @ventostack/workflow - 模块聚合
 */

import type { Database } from "@ventostack/database";
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import { createWorkflowService } from "./services/workflow";
import type { WorkflowService } from "./services/workflow";
import { createWorkflowRoutes } from "./routes/workflow";
import { createAuthMiddleware } from "./middlewares/auth-guard";

export interface WorkflowModule {
  services: {
    workflow: WorkflowService;
  };
  router: Router;
  init(): Promise<void>;
}

export interface WorkflowModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createWorkflowModule(deps: WorkflowModuleDeps): WorkflowModule {
  const { db, jwt, jwtSecret, rbac } = deps;

  const workflowService = createWorkflowService({ db });
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

  const router = createWorkflowRoutes(workflowService, authMiddleware, perm as any);

  return {
    services: { workflow: workflowService },
    router,
    async init() {},
  };
}
