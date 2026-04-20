// @aeron/core - 连接池释放与资源管理

export interface Disposable {
  name: string;
  close(): Promise<void>;
}

export interface PoolManager {
  register(resource: Disposable): void;
  releaseAll(): Promise<{ name: string; error?: string }[]>;
  list(): string[];
}

/**
 * 创建连接池/资源管理器，用于优雅关闭时释放所有连接池
 */
export function createPoolManager(): PoolManager {
  const resources: Disposable[] = [];

  return {
    register(resource: Disposable): void {
      resources.push(resource);
    },

    async releaseAll(): Promise<{ name: string; error?: string }[]> {
      const results: { name: string; error?: string }[] = [];
      // 逆序释放（后注册先释放）
      for (let i = resources.length - 1; i >= 0; i--) {
        const resource = resources[i]!;
        try {
          await resource.close();
          results.push({ name: resource.name });
        } catch (err) {
          results.push({
            name: resource.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      resources.length = 0;
      return results;
    },

    list(): string[] {
      return resources.map((r) => r.name);
    },
  };
}
