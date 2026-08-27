/**
 * @ventostack/ai-trace — 追踪开关配置
 *
 * 基于 sys_config 的 `ai_trace_enabled` key（'true'/'false' 字符串），
 * 读取走配置缓存，写入按 key 定位并刷新缓存，运行时即时生效。
 */

import type { Database } from "@ventostack/database";

/** sys_config 中的开关 key */
export const TRACE_CONFIG_KEY = "ai_trace_enabled";

/**
 * 配置读取提供者（结构化兼容 @ventostack/system 的 ConfigService，
 * 避免 ai-trace 与 system 的包级依赖耦合）
 */
export interface TraceConfigProvider {
  getValue(key: string): Promise<string | null>;
  refreshCache(key?: string): Promise<void>;
}

/** 追踪配置服务接口 */
export interface TraceConfigService {
  /** 开关是否开启（缺省视为开启：默认可审计） */
  isEnabled(): Promise<boolean>;
  /** 设置开关并刷新缓存 */
  setEnabled(enabled: boolean): Promise<void>;
}

export function createTraceConfigService(deps: {
  db: Database;
  configProvider: TraceConfigProvider;
}): TraceConfigService {
  const { db, configProvider } = deps;

  async function isEnabled(): Promise<boolean> {
    const value = await configProvider.getValue(TRACE_CONFIG_KEY);
    if (value === null) return true;
    return value === "true";
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    const value = enabled ? "true" : "false";
    const updated = (await db.raw(
      `UPDATE sys_config SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING id`,
      [value, TRACE_CONFIG_KEY],
    )) as unknown[];

    // key 不存在时插入（幂等：并发写入由 unique(key) 约束兜底）
    if (updated.length === 0) {
      await db.raw(
        `INSERT INTO sys_config (id, name, key, value, type, "group", sort, remark, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET value = $4, updated_at = NOW()`,
        [
          crypto.randomUUID(),
          "AI 链路追踪开关",
          TRACE_CONFIG_KEY,
          value,
          1,
          "ai",
          "是否记录 AI 请求的完整调用链路",
        ],
      );
    }
    await configProvider.refreshCache(TRACE_CONFIG_KEY);
  }

  return { isEnabled, setEnabled };
}
