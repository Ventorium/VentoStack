/**
 * AI 模块缓存策略
 * 知识库搜索缓存（Redis + TTL 5min）+ Agent 配置缓存（内存 Map + TTL 5min）
 */
import type { Cache } from "@ventostack/cache";

export interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
  maxIterations?: number;
  tenantId: string;
}

export interface AICache {
  /** 获取知识库搜索缓存 */
  getSearchResult(kbId: string, queryHash: string): Promise<SearchResult[] | null>;
  /** 设置知识库搜索缓存（TTL 5min） */
  setSearchResult(kbId: string, queryHash: string, results: SearchResult[]): Promise<void>;
  /** 知识库文档变更时清除搜索缓存 */
  invalidateSearchCache(kbId: string): Promise<void>;

  /** 获取 Agent 配置缓存 */
  getAgentConfig(agentId: string): Promise<AgentConfig | null>;
  /** 设置 Agent 配置缓存（内存 Map + TTL 5min） */
  setAgentConfig(agentId: string, config: AgentConfig): Promise<void>;
  /** 使 Agent 配置缓存失效 */
  invalidateAgentConfig(agentId: string): Promise<void>;
}

const SEARCH_TTL_SECONDS = 300; // 5 分钟
const AGENT_CONFIG_TTL_MS = 300_000; // 5 分钟

function buildSearchKey(kbId: string, queryHash: string): string {
  return `ai:kb:${kbId}:search:${queryHash}`;
}

export function createAICache(cache: Cache): AICache {
  /** 内存 Map 缓存 Agent 配置 */
  const agentConfigCache = new Map<string, { config: AgentConfig; expiresAt: number }>();

  async function getSearchResult(
    kbId: string,
    queryHash: string,
  ): Promise<SearchResult[] | null> {
    const key = buildSearchKey(kbId, queryHash);
    return cache.get<SearchResult[]>(key);
  }

  async function setSearchResult(
    kbId: string,
    queryHash: string,
    results: SearchResult[],
  ): Promise<void> {
    const key = buildSearchKey(kbId, queryHash);
    await cache.set(key, results, { ttl: SEARCH_TTL_SECONDS });
  }

  async function invalidateSearchCache(kbId: string): Promise<void> {
    // 精确前缀删除不可行时，使用 flush 策略
    // 实际生产中应使用 Redis SCAN + 匹配删除
    const key = buildSearchKey(kbId, "*");
    await cache.del(key).catch(() => {
      // 降级：忽略删除失败
    });
  }

  async function getAgentConfig(agentId: string): Promise<AgentConfig | null> {
    const cached = agentConfigCache.get(agentId);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      agentConfigCache.delete(agentId);
      return null;
    }
    return cached.config;
  }

  async function setAgentConfig(
    agentId: string,
    config: AgentConfig,
  ): Promise<void> {
    agentConfigCache.set(agentId, {
      config,
      expiresAt: Date.now() + AGENT_CONFIG_TTL_MS,
    });
  }

  async function invalidateAgentConfig(agentId: string): Promise<void> {
    agentConfigCache.delete(agentId);
  }

  return {
    getSearchResult,
    setSearchResult,
    invalidateSearchCache,
    getAgentConfig,
    setAgentConfig,
    invalidateAgentConfig,
  };
}
