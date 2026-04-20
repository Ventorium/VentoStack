// @aeron/core - 内存控制与资源监控

export interface MemoryInfo {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  usagePercent: number;
}

export interface MemoryControlOptions {
  /** 内存使用率告警阈值（0-1） */
  warningThreshold?: number;
  /** 内存使用率最大阈值（0-1），超过时触发保护 */
  maxThreshold?: number;
  /** 检查间隔（ms） */
  checkInterval?: number;
  /** 告警回调 */
  onWarning?: (info: MemoryInfo) => void;
  /** 超过最大阈值回调 */
  onCritical?: (info: MemoryInfo) => void;
}

export interface MemoryController {
  getInfo(): MemoryInfo;
  isHealthy(): boolean;
  start(): void;
  stop(): void;
}

/**
 * 创建内存控制器
 */
export function createMemoryController(options?: MemoryControlOptions): MemoryController {
  const warningThreshold = options?.warningThreshold ?? 0.8;
  const maxThreshold = options?.maxThreshold ?? 0.95;
  const checkInterval = options?.checkInterval ?? 30000;
  let timer: ReturnType<typeof setInterval> | null = null;

  function getInfo(): MemoryInfo {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        usagePercent: mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0,
      };
    }
    return { heapUsed: 0, heapTotal: 0, rss: 0, external: 0, usagePercent: 0 };
  }

  function check(): void {
    const info = getInfo();
    if (info.usagePercent >= maxThreshold && options?.onCritical) {
      options.onCritical(info);
    } else if (info.usagePercent >= warningThreshold && options?.onWarning) {
      options.onWarning(info);
    }
  }

  return {
    getInfo,

    isHealthy(): boolean {
      const info = getInfo();
      return info.usagePercent < maxThreshold;
    },

    start(): void {
      if (timer) return;
      timer = setInterval(check, checkInterval);
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
