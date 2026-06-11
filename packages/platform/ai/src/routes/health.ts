/**
 * 健康检查路由
 * GET /api/ai/healthz — 公开，简单状态检查
 * GET /api/ai/health — 需认证，各组件详细状态
 */
import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { ok, handleError } from "./common";

export interface HealthCheckDeps {
  /** 检查数据库连接 */
  checkDatabase?: () => Promise<boolean>;
  /** 检查缓存连接 */
  checkCache?: () => Promise<boolean>;
  /** 检查 LLM 连接 */
  checkLLM?: () => Promise<boolean>;
  authMiddleware: Middleware;
}

export function createHealthRoutes(deps: HealthCheckDeps): Router {
  const router = createRouter();

  // 公开健康检查 — 不需要认证
  router.get("/api/ai/healthz", async () => {
    return ok({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 详细健康检查 — 需要认证
  router.get("/api/ai/health", deps.authMiddleware, async () => {
    try {
      const checks: Record<string, string> = {};

      if (deps.checkDatabase) {
        try {
          const dbOk = await deps.checkDatabase();
          checks.database = dbOk ? "ok" : "degraded";
        } catch {
          checks.database = "error";
        }
      }

      if (deps.checkCache) {
        try {
          const cacheOk = await deps.checkCache();
          checks.cache = cacheOk ? "ok" : "degraded";
        } catch {
          checks.cache = "error";
        }
      }

      if (deps.checkLLM) {
        try {
          const llmOk = await deps.checkLLM();
          checks.llm = llmOk ? "ok" : "degraded";
        } catch {
          checks.llm = "error";
        }
      }

      const allOk = Object.values(checks).every((v) => v === "ok");

      return ok({
        status: allOk ? "ok" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      return handleError(e);
    }
  });

  return router;
}
