/**
 * @ventostack/core — 标签日志工具
 *
 * 用于启动阶段、CLI、种子脚本等场景的轻量日志，
 * 统一 `[tag] message` 格式，无需初始化 Logger 实例。
 *
 * ```ts
 * const log = createTagLogger("cache");
 * log.info("Using Redis adapter");
 * // → [cache] Using Redis adapter
 * ```
 */

export interface TagLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return " " + JSON.stringify(meta);
  } catch {
    return "";
  }
}

/**
 * 创建带标签的轻量日志器
 * @param tag 日志标签，如 "cache"、"migrations"、"seeds"
 */
export function createTagLogger(tag: string): TagLogger {
  return {
    info(message: string, meta?: Record<string, unknown>): void {
      console.log(`[${tag}] ${message}${formatMeta(meta)}`);
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      console.warn(`[${tag}] ${message}${formatMeta(meta)}`);
    },
    error(message: string, meta?: Record<string, unknown>): void {
      console.error(`[${tag}] ${message}${formatMeta(meta)}`);
    },
  };
}
