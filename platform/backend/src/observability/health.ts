/**
 * 健康检查
 */

import { createHealthCheck } from "@ventostack/observability";
import type { HealthCheck } from "@ventostack/observability";
import type { SqlExecutor } from "@ventostack/database";

export function createAppHealthCheck(executor: SqlExecutor): HealthCheck {
  return createHealthCheck({
    checks: [
      {
        name: "database",
        async check() {
          try {
            await executor("SELECT 1");
            return { status: "healthy" as const };
          } catch (err) {
            return {
              status: "unhealthy" as const,
              error: err instanceof Error ? err.message : "unknown",
            };
          }
        },
      },
    ],
  });
}
