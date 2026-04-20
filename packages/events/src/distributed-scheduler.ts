// @aeron/events - 分布式任务调度（防重复执行，抢锁机制）

export interface DistributedTask {
  id: string;
  name: string;
  cron?: string;
  handler: () => Promise<void>;
  timeout?: number;
}

export interface DistributedSchedulerOptions {
  /** 实例 ID */
  instanceId?: string;
  /** 锁超时（ms） */
  lockTimeout?: number;
  /** 锁续期间隔（ms） */
  renewInterval?: number;
}

export interface TaskLock {
  taskId: string;
  instanceId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface DistributedScheduler {
  register(task: DistributedTask): void;
  tryAcquire(taskId: string): Promise<boolean>;
  release(taskId: string): void;
  execute(taskId: string): Promise<{ success: boolean; error?: string; duration: number }>;
  getLocks(): TaskLock[];
  getRegistered(): string[];
}

/**
 * 创建分布式任务调度器
 * 使用内存锁实现（生产环境应替换为 Redis 分布式锁）
 */
export function createDistributedScheduler(options?: DistributedSchedulerOptions): DistributedScheduler {
  const instanceId = options?.instanceId ?? crypto.randomUUID();
  const lockTimeout = options?.lockTimeout ?? 60000;
  const tasks = new Map<string, DistributedTask>();
  const locks = new Map<string, TaskLock>();

  function cleanExpiredLocks(): void {
    const now = Date.now();
    for (const [taskId, lock] of locks) {
      if (lock.expiresAt <= now) {
        locks.delete(taskId);
      }
    }
  }

  return {
    register(task: DistributedTask): void {
      tasks.set(task.id, task);
    },

    async tryAcquire(taskId: string): Promise<boolean> {
      cleanExpiredLocks();
      const existing = locks.get(taskId);
      if (existing && existing.expiresAt > Date.now()) {
        return false; // 已被其他实例锁定
      }

      locks.set(taskId, {
        taskId,
        instanceId,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + lockTimeout,
      });
      return true;
    },

    release(taskId: string): void {
      const lock = locks.get(taskId);
      if (lock && lock.instanceId === instanceId) {
        locks.delete(taskId);
      }
    },

    async execute(taskId: string): Promise<{ success: boolean; error?: string; duration: number }> {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: `Task not found: ${taskId}`, duration: 0 };
      }

      const acquired = await this.tryAcquire(taskId);
      if (!acquired) {
        return { success: false, error: "Failed to acquire lock", duration: 0 };
      }

      const start = performance.now();
      try {
        if (task.timeout) {
          await Promise.race([
            task.handler(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Task timeout")), task.timeout),
            ),
          ]);
        } else {
          await task.handler();
        }
        return { success: true, duration: performance.now() - start };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          duration: performance.now() - start,
        };
      } finally {
        this.release(taskId);
      }
    },

    getLocks(): TaskLock[] {
      cleanExpiredLocks();
      return Array.from(locks.values());
    },

    getRegistered(): string[] {
      return Array.from(tasks.keys());
    },
  };
}
