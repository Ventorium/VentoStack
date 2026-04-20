// @aeron/database - 读写分离 / 多数据源切换

import type { SqlExecutor, Database } from "./database";

export interface ReadWriteSplitOptions {
  /** 写库执行器 */
  writer: SqlExecutor;
  /** 读库执行器（可多个，负载均衡） */
  readers: SqlExecutor[];
  /** 负载均衡策略 */
  strategy?: "round-robin" | "random";
}

export interface ReadWriteSplitExecutor {
  /** 读操作路由到读库 */
  read(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** 写操作路由到写库 */
  write(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** 自动路由（根据 SQL 判断读/写） */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** 获取当前读库索引 */
  currentReaderIndex(): number;
}

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TRUNCATE", "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT"];

function isWriteQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return WRITE_KEYWORDS.some((kw) => trimmed.startsWith(kw));
}

/**
 * 创建读写分离执行器
 */
export function createReadWriteSplit(options: ReadWriteSplitOptions): ReadWriteSplitExecutor {
  const { writer, readers, strategy = "round-robin" } = options;
  if (readers.length === 0) {
    throw new Error("At least one reader is required");
  }

  let currentIdx = 0;

  function nextReader(): SqlExecutor {
    if (strategy === "random") {
      return readers[Math.floor(Math.random() * readers.length)]!;
    }
    // round-robin
    const reader = readers[currentIdx % readers.length]!;
    currentIdx++;
    return reader;
  }

  return {
    async read(sql: string, params?: unknown[]): Promise<unknown[]> {
      const reader = nextReader();
      return reader(sql, params);
    },

    async write(sql: string, params?: unknown[]): Promise<unknown[]> {
      return writer(sql, params);
    },

    async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
      if (isWriteQuery(sql)) {
        return writer(sql, params);
      }
      return this.read(sql, params);
    },

    currentReaderIndex(): number {
      return (currentIdx - 1 + readers.length) % readers.length;
    },
  };
}

export interface MultiDataSourceOptions {
  sources: Record<string, SqlExecutor>;
  defaultSource?: string;
}

export interface MultiDataSource {
  get(name: string): SqlExecutor;
  getDefault(): SqlExecutor;
  list(): string[];
  has(name: string): boolean;
}

/**
 * 创建多数据源管理器
 */
export function createMultiDataSource(options: MultiDataSourceOptions): MultiDataSource {
  const { sources, defaultSource } = options;
  const names = Object.keys(sources);
  if (names.length === 0) throw new Error("At least one data source is required");

  const defaultName = defaultSource ?? names[0]!;

  return {
    get(name: string): SqlExecutor {
      const source = sources[name];
      if (!source) throw new Error(`Data source not found: ${name}`);
      return source;
    },

    getDefault(): SqlExecutor {
      return sources[defaultName]!;
    },

    list(): string[] {
      return names;
    },

    has(name: string): boolean {
      return name in sources;
    },
  };
}
