/**
 * @ventostack/workflow — 模块聚合
 */

import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createWorkflowRoutes } from "./routes/workflow";
import { createWorkflowService } from "./services";
import type { WorkflowService } from "./services";

export interface WorkflowModule {
  services: { workflow: WorkflowService };
  router: Router;
  init(): Promise<void>;
}

export interface WorkflowModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus?: EventBus;
}

export function createWorkflowModule(deps: WorkflowModuleDeps): WorkflowModule {
  const { db, jwt, jwtSecret, rbac, eventBus } = deps;

  const serviceDeps: Parameters<typeof createWorkflowService>[0] = { db };
  if (eventBus) serviceDeps.eventBus = eventBus;
  const workflowService = createWorkflowService(serviceDeps);
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac!);

  const router = createWorkflowRoutes(workflowService, authMiddleware, perm);

  return {
    services: { workflow: workflowService },
    router,
    async init() {},
  };
}
