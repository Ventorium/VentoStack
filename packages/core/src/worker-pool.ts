// @aeron/core - Worker Pool（Bun Worker Threads）

export interface WorkerTask<T = unknown> {
  type: string;
  payload: T;
}

export interface WorkerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WorkerPoolOptions {
  /** Worker 脚本路径 */
  workerURL: string | URL;
  /** 最小 Worker 数量 */
  minWorkers?: number;
  /** 最大 Worker 数量 */
  maxWorkers?: number;
  /** 任务超时（毫秒） */
  taskTimeout?: number;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
}

export interface WorkerPool {
  /** 提交任务 */
  execute<T = unknown, R = unknown>(task: WorkerTask<T>): Promise<WorkerResult<R>>;
  /** 获取活跃 Worker 数量 */
  size(): number;
  /** 获取空闲 Worker 数量 */
  idle(): number;
  /** 关闭 Pool */
  terminate(): void;
}

export function createWorkerPool(options: WorkerPoolOptions): WorkerPool {
  const {
    workerURL,
    minWorkers = 1,
    maxWorkers = navigator.hardwareConcurrency || 4,
    taskTimeout = 30_000,
  } = options;

  const workers: PooledWorker[] = [];
  const taskQueue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
  }> = [];

  function spawnWorker(): PooledWorker {
    const worker = new Worker(workerURL);
    const pooled: PooledWorker = { worker, busy: false };
    workers.push(pooled);
    return pooled;
  }

  // 预热最小数量的 Workers
  for (let i = 0; i < minWorkers; i++) {
    spawnWorker();
  }

  function getIdleWorker(): PooledWorker | null {
    return workers.find((w) => !w.busy) ?? null;
  }

  function processQueue(): void {
    while (taskQueue.length > 0) {
      let worker = getIdleWorker();

      if (!worker && workers.length < maxWorkers) {
        worker = spawnWorker();
      }

      if (!worker) break;

      const item = taskQueue.shift()!;
      worker.busy = true;

      const timer = setTimeout(() => {
        worker!.busy = false;
        item.reject(new Error(`Worker task timed out after ${taskTimeout}ms`));
        processQueue();
      }, taskTimeout);

      worker.worker.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        worker!.busy = false;
        item.resolve(event.data as WorkerResult);
        processQueue();
      };

      worker.worker.onerror = (event: ErrorEvent) => {
        clearTimeout(timer);
        worker!.busy = false;
        item.reject(new Error(event.message || "Worker error"));
        processQueue();
      };

      worker.worker.postMessage(item.task);
    }
  }

  return {
    execute<T = unknown, R = unknown>(task: WorkerTask<T>): Promise<WorkerResult<R>> {
      return new Promise((resolve, reject) => {
        taskQueue.push({
          task,
          resolve: resolve as (r: WorkerResult) => void,
          reject,
        });
        processQueue();
      });
    },

    size() {
      return workers.length;
    },

    idle() {
      return workers.filter((w) => !w.busy).length;
    },

    terminate() {
      for (const w of workers) {
        w.worker.terminate();
      }
      workers.length = 0;
      taskQueue.length = 0;
    },
  };
}
