/**
 * Token 限流器
 * per-user 每日 Token 消耗上限，防止成本失控
 * 实现：基于 Cache 的计数器 + TTL 自动过期
 */
import type { Cache } from "@ventostack/cache";
import { aiErrors } from "../errors";

export interface TokenBudgetConfig {
  /** 每用户每日 Token 上限 */
  perUserDaily: number;
  /** 每会话最大轮次 */
  perConversationTurns: number;
}

export interface TokenBudgetChecker {
  /** 检查用户是否还有额度 */
  check(userId: string, tenantId: string): Promise<{ allowed: boolean; remaining: number }>;
  /** 消耗 Token 额度 */
  consume(userId: string, tenantId: string, tokens: number): Promise<void>;
  /** 获取当前已消耗量 */
  getUsage(userId: string, tenantId: string): Promise<number>;
}

const TOKEN_PREFIX = "ai:token:";
const DEFAULT_PER_USER_DAILY = 100_000;
const DEFAULT_PER_CONVERSATION_TURNS = 50;
/** 缓存 TTL：到次日凌晨过期（简化为 24 小时） */
const CACHE_TTL_SECONDS = 86_400;

function getDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createTokenBudgetChecker(deps: {
  cache: Cache;
  config?: Partial<TokenBudgetConfig>;
}): TokenBudgetChecker {
  const { cache, config: overrides } = deps;
  const config: TokenBudgetConfig = {
    perUserDaily: overrides?.perUserDaily ?? DEFAULT_PER_USER_DAILY,
    perConversationTurns: overrides?.perConversationTurns ?? DEFAULT_PER_CONVERSATION_TURNS,
  };

  function buildKey(userId: string, tenantId: string): string {
    return `${TOKEN_PREFIX}${tenantId}:${userId}:${getDateKey()}`;
  }

  async function getUsage(userId: string, tenantId: string): Promise<number> {
    const key = buildKey(userId, tenantId);
    const usage = await cache.get<number>(key);
    return usage ?? 0;
  }

  async function check(
    userId: string,
    tenantId: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const usage = await getUsage(userId, tenantId);
    const remaining = Math.max(0, config.perUserDaily - usage);
    return { allowed: remaining > 0, remaining };
  }

  async function consume(
    userId: string,
    tenantId: string,
    tokens: number,
  ): Promise<void> {
    const key = buildKey(userId, tenantId);
    const current = await cache.get<number>(key) ?? 0;
    const newUsage = current + tokens;

    if (newUsage > config.perUserDaily) {
      throw aiErrors.tokenBudgetExceeded();
    }

    await cache.set(key, newUsage, { ttl: CACHE_TTL_SECONDS });
  }

  return { check, consume, getUsage };
}
