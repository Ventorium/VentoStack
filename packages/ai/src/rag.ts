// @aeron/ai - RAG 知识库管理

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  /** 预计算的 embedding 向量 */
  embedding?: number[];
}

export interface ChunkOptions {
  /** 每个 chunk 的最大字符数 */
  maxChunkSize?: number;
  /** chunk 之间的重叠字符数 */
  overlap?: number;
  /** 分隔符 */
  separator?: string;
}

export interface SearchResult {
  document: Document;
  score: number;
}

export interface KnowledgeBase {
  /** 添加文档 */
  add(doc: Omit<Document, "id">): string;
  /** 删除文档 */
  remove(id: string): boolean;
  /** 按内容关键字搜索 */
  search(query: string, limit?: number): SearchResult[];
  /** 获取所有文档 */
  list(): Document[];
  /** 获取文档数量 */
  size(): number;
  /** 文本分块 */
  chunk(text: string, options?: ChunkOptions): string[];
}

/**
 * 简单的基于 TF-IDF 的相似度计算（内存实现）。
 * 生产环境应接入向量数据库。
 */
function computeTermFrequency(text: string): Map<string, number> {
  const terms = text.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  const freq = new Map<string, number>();
  for (const term of terms) {
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, freq] of a) {
    normA += freq * freq;
    const bFreq = b.get(term) ?? 0;
    dotProduct += freq * bFreq;
  }
  for (const [, freq] of b) {
    normB += freq * freq;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function createKnowledgeBase(): KnowledgeBase {
  const documents = new Map<string, Document>();
  let idCounter = 0;

  return {
    add(doc) {
      const id = `doc_${++idCounter}_${Date.now()}`;
      documents.set(id, { ...doc, id });
      return id;
    },

    remove(id) {
      return documents.delete(id);
    },

    search(query, limit = 10) {
      const queryTF = computeTermFrequency(query);
      const results: SearchResult[] = [];

      for (const doc of documents.values()) {
        const docTF = computeTermFrequency(doc.content);
        const score = cosineSimilarity(queryTF, docTF);
        if (score > 0) {
          results.push({ document: doc, score });
        }
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    list() {
      return [...documents.values()];
    },

    size() {
      return documents.size;
    },

    chunk(text, options) {
      const maxSize = options?.maxChunkSize ?? 1000;
      const overlap = options?.overlap ?? 200;
      const separator = options?.separator ?? "\n\n";

      // 先按段落分割
      const paragraphs = text.split(separator).filter((p) => p.trim().length > 0);
      const chunks: string[] = [];
      let current = "";

      for (const para of paragraphs) {
        if (current.length + para.length + separator.length > maxSize && current.length > 0) {
          chunks.push(current.trim());
          // 保留重叠部分
          if (overlap > 0 && current.length > overlap) {
            current = current.slice(-overlap) + separator + para;
          } else {
            current = para;
          }
        } else {
          current = current ? current + separator + para : para;
        }
      }

      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }

      return chunks;
    },
  };
}

// ---- Agent 配置系统 ----

export interface AgentConfig {
  name: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 入参定义 */
  inputSchema?: Record<string, { type: string; description: string; required?: boolean }>;
  /** 关联的知识库 */
  knowledgeBase?: KnowledgeBase;
  /** 记忆配置 */
  memory?: {
    shortTerm?: boolean;
    longTerm?: boolean;
    maxItems?: number;
  };
}

export interface AgentRegistry {
  register(config: AgentConfig): void;
  get(name: string): AgentConfig | undefined;
  list(): AgentConfig[];
  remove(name: string): boolean;
}

export function createAgentRegistry(): AgentRegistry {
  const agents = new Map<string, AgentConfig>();

  return {
    register(config) {
      agents.set(config.name, config);
    },

    get(name) {
      return agents.get(name);
    },

    list() {
      return [...agents.values()];
    },

    remove(name) {
      return agents.delete(name);
    },
  };
}
