// @aeron/database - 连接池管理

export interface ConnectionPoolOptions {
  /** 最大连接数 */
  max?: number;
  /** 最小空闲连接数 */
  min?: number;
  /** 空闲连接超时（ms） */
  idleTimeout?: number;
  /** 获取连接超时（ms） */
  acquireTimeout?: number;
  /** 连接最大存活时间（ms） */
  maxLifetime?: number;
}

export interface PoolStats {
  total: number;
  active: number;
  idle: number;
  waiting: number;
  maxSize: number;
}

export interface ConnectionPool<T> {
  acquire(): Promise<T>;
  release(conn: T): void;
  destroy(conn: T): void;
  stats(): PoolStats;
  drain(): Promise<void>;
  size(): number;
}

interface PooledConnection<T> {
  conn: T;
  createdAt: number;
  lastUsed: number;
  active: boolean;
}

/**
 * 创建通用连接池
 */
export function createConnectionPool<T>(
  factory: {
    create: () => Promise<T>;
    destroy: (conn: T) => Promise<void>;
    validate?: (conn: T) => Promise<boolean>;
  },
  options?: ConnectionPoolOptions,
): ConnectionPool<T> {
  const max = options?.max ?? 10;
  const min = options?.min ?? 2;
  const idleTimeout = options?.idleTimeout ?? 30000;
  const acquireTimeout = options?.acquireTimeout ?? 5000;
  const maxLifetime = options?.maxLifetime ?? 3600000;

  const connections: PooledConnection<T>[] = [];
  const waitQueue: { resolve: (conn: T) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  let closed = false;

  function getIdleConnection(): PooledConnection<T> | undefined {
    const now = Date.now();
    for (const pc of connections) {
      if (!pc.active && now - pc.createdAt < maxLifetime && now - pc.lastUsed < idleTimeout) {
        return pc;
      }
    }
    return undefined;
  }

  function cleanup(): void {
    const now = Date.now();
    for (let i = connections.length - 1; i >= 0; i--) {
      const pc = connections[i]!;
      if (!pc.active && (now - pc.createdAt >= maxLifetime || now - pc.lastUsed >= idleTimeout)) {
        connections.splice(i, 1);
        factory.destroy(pc.conn).catch(() => {});
      }
    }
  }

  const cleanupTimer = setInterval(cleanup, Math.min(idleTimeout, 10000));

  return {
    async acquire(): Promise<T> {
      if (closed) throw new Error("Pool is closed");

      // 尝试复用空闲连接
      const idle = getIdleConnection();
      if (idle) {
        idle.active = true;
        idle.lastUsed = Date.now();
        if (factory.validate) {
          const valid = await factory.validate(idle.conn);
          if (!valid) {
            const idx = connections.indexOf(idle);
            if (idx !== -1) connections.splice(idx, 1);
            await factory.destroy(idle.conn);
            return this.acquire();
          }
        }
        return idle.conn;
      }

      // 创建新连接
      if (connections.length < max) {
        const conn = await factory.create();
        const pc: PooledConnection<T> = {
          conn,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          active: true,
        };
        connections.push(pc);
        return conn;
      }

      // 等待空闲连接
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waitQueue.findIndex((w) => w.resolve === resolve);
          if (idx !== -1) waitQueue.splice(idx, 1);
          reject(new Error("Acquire connection timeout"));
        }, acquireTimeout);
        waitQueue.push({ resolve, reject, timer });
      });
    },

    release(conn: T): void {
      const pc = connections.find((c) => c.conn === conn);
      if (!pc) return;
      pc.active = false;
      pc.lastUsed = Date.now();

      // 唤醒等待中的请求
      if (waitQueue.length > 0) {
        const waiter = waitQueue.shift()!;
        clearTimeout(waiter.timer);
        pc.active = true;
        pc.lastUsed = Date.now();
        waiter.resolve(conn);
      }
    },

    destroy(conn: T): void {
      const idx = connections.findIndex((c) => c.conn === conn);
      if (idx !== -1) {
        connections.splice(idx, 1);
        factory.destroy(conn).catch(() => {});
      }
    },

    stats(): PoolStats {
      return {
        total: connections.length,
        active: connections.filter((c) => c.active).length,
        idle: connections.filter((c) => !c.active).length,
        waiting: waitQueue.length,
        maxSize: max,
      };
    },

    async drain(): Promise<void> {
      closed = true;
      clearInterval(cleanupTimer);
      for (const waiter of waitQueue) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Pool is draining"));
      }
      waitQueue.length = 0;
      for (const pc of connections) {
        await factory.destroy(pc.conn).catch(() => {});
      }
      connections.length = 0;
    },

    size(): number {
      return connections.length;
    },
  };
}
