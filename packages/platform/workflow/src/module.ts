/**
 * @ventostack/workflow - 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createWorkflowRoutes } from "./routes/workflow";
import { createWorkflowService } from "./services/workflow";
import type { WorkflowService } from "./services/workflow";

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
  const perm = createPermMiddleware(rbac);

  const router = createWorkflowRoutes(workflowService, authMiddleware, perm);

  return {
    services: { workflow: workflowService },
    router,
    async init() {},
  };
}
