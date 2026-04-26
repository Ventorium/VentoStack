/**
 * 结构化日志
 */

import { createLogger } from "@ventostack/observability";
import type { Logger } from "@ventostack/observability";

export type { Logger };

let _logger: Logger | null = null;

export function createAppLogger(): Logger {
  if (_logger) return _logger;

  _logger = createLogger({
    level: (process.env.LOG_LEVEL as any) ?? "info",
    format: "json",
  });

  return _logger;
}
