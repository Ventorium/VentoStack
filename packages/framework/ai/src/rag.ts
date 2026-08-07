/**
 * @ventostack/ai — RAG 知识库与智能体管理
 *
 * 提供基于内存的文档存储、TF-IDF 相似度检索、文本分块，以及智能体注册表能力。
 * 生产环境建议将知识库替换为向量数据库实现。
 */

/** 文档 */
export interface Document {
  /** 文档唯一标识 */
  id: string;
  /** 文档内容 */
  content: string;
  /** 可选的文档元数据 */
  metadata?: Record<string, unknown>;
  /** 预计算的 embedding 向量 */
  embedding?: number[];
}

/** 文本分块选项 */
export interface ChunkOptions {
  /** 每个 chunk 的最大字符数 */
  maxChunkSize?: number;
  /** chunk 之间的重叠字符数 */
  overlap?: number;
  /** 分隔符 */
  separator?: string;
}

/** 搜索结果 */
export interface SearchResult {
  /** 匹配文档 */
  document: Document;
  /** 相似度得分 */
  score: number;
}

/** 知识库，提供文档存储、检索和分块能力 */
export interface KnowledgeBase {
  /**
   * 添加文档
   * @param doc - 文档内容（不含 id）
   * @returns 生成的文档 ID
   */
  add(doc: Omit<Document, "id">): string;

  /**
   * 删除文档
   * @param id - 文档 ID
   * @returns 删除成功返回 true
   */
  remove(id: string): boolean;

  /**
   * 按内容关键字搜索
   * @param query - 搜索关键词
   * @param limit - 最大返回结果数，默认 10
   * @returns 搜索结果数组
   */
  search(query: string, limit?: number): SearchResult[];

  /** 获取所有文档 */
  list(): Document[];

  /** 获取文档数量 */
  size(): number;

  /**
   * 文本分块
   * @param text - 待分块文本
   * @param options - 分块选项
   * @returns 分块后的文本数组
   */
  chunk(text: string, options?: ChunkOptions): string[];
}

/**
 * 计算词频（TF），用于基于 TF-IDF 的相似度计算（内存实现）。
 * 生产环境应接入向量数据库。
 * @param text - 输入文本
 * @returns 词频映射表
 */
function computeTermFrequency(text: string): Map<string, number> {
  const terms: string[] = [];
  const lower = text.toLowerCase();

  // 提取英文单词 / 数字标识符
  const words = lower.match(/[a-z0-9_]+/g) ?? [];
  terms.push(...words.filter((t) => t.length > 1));

  // 提取中文字符（按单字切分，确保短查询也能命中）
  const chineseChars = lower.match(/[\u4e00-\u9fa5]/g) ?? [];
  terms.push(...chineseChars);

  const freq = new Map<string, number>();
  for (const term of terms) {
    freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  return freq;
}

/**
 * 计算两个词频向量的余弦相似度
 * @param a - 向量 A
 * @param b - 向量 B
 * @returns 相似度得分（0 ~ 1）
 */
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

/**
 * 创建知识库实例
 * @returns KnowledgeBase 实例
 */
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

      return results.sort((a, b) => b.score - a.score).slice(0, limit);
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

/** 智能体配置 */
export interface AgentConfig {
  /** 智能体名称 */
  name: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 入参定义 */
  inputSchema?: Record<string, { type: string; description: string; required?: boolean }>;
  /** 关联的知识库 */
  knowledgeBase?: KnowledgeBase;
  /** 记忆配置 */
  memory?: {
    /** 是否启用短期记忆 */
    shortTerm?: boolean;
    /** 是否启用长期记忆 */
    longTerm?: boolean;
    /** 最大记忆条目数 */
    maxItems?: number;
  };
}

/** 智能体注册表 */
export interface AgentRegistry {
  /**
   * 注册智能体配置
   * @param config - 智能体配置
   */
  register(config: AgentConfig): void;

  /**
   * 获取智能体配置
   * @param name - 智能体名称
   * @returns 智能体配置，不存在返回 undefined
   */
  get(name: string): AgentConfig | undefined;

  /** 列出所有已注册的智能体配置 */
  list(): AgentConfig[];

  /**
   * 移除智能体配置
   * @param name - 智能体名称
   * @returns 移除成功返回 true
   */
  remove(name: string): boolean;
}

/**
 * 创建智能体注册表实例
 * @returns AgentRegistry 实例
 */
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
