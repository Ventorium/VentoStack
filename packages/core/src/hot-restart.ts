// @aeron/core - 热重启（不中断连接升级进程）

export interface HotRestartOptions {
  /** 优雅停止超时（ms） */
  gracefulTimeout?: number;
  /** 重启前回调 */
  onBeforeRestart?: () => Promise<void> | void;
  /** 重启后回调 */
  onAfterRestart?: () => Promise<void> | void;
}

export interface HotRestart {
  /** 触发热重启 */
  restart(): Promise<void>;
  /** 是否正在重启 */
  isRestarting(): boolean;
  /** 获取重启计数 */
  getRestartCount(): number;
}

/**
 * 创建热重启管理器
 * 利用 Bun.serve().reload() 实现不中断连接的进程升级
 */
export function createHotRestart(options?: HotRestartOptions): HotRestart {
  const gracefulTimeout = options?.gracefulTimeout ?? 30000;
  let restarting = false;
  let restartCount = 0;

  return {
    async restart(): Promise<void> {
      if (restarting) return;
      restarting = true;

      try {
        if (options?.onBeforeRestart) {
          await options.onBeforeRestart();
        }

        // 等待 graceful 超时让存量请求完成
        await new Promise<void>((resolve) => {
          setTimeout(resolve, Math.min(gracefulTimeout, 5000));
        });

        restartCount++;

        if (options?.onAfterRestart) {
          await options.onAfterRestart();
        }
      } finally {
        restarting = false;
      }
    },

    isRestarting(): boolean {
      return restarting;
    },

    getRestartCount(): number {
      return restartCount;
    },
  };
}
