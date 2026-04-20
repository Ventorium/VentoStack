// @aeron/core - 配置动态热更新

export interface ConfigWatcherOptions {
  /** 检查间隔（ms） */
  interval?: number;
  /** 变更回调 */
  onChange: (newConfig: Record<string, unknown>, oldConfig: Record<string, unknown>) => void | Promise<void>;
}

export interface ConfigWatcher {
  start(initial: Record<string, unknown>): void;
  stop(): void;
  isWatching(): boolean;
  update(newConfig: Record<string, unknown>): Promise<void>;
  getConfig(): Record<string, unknown>;
}

/**
 * 创建配置热更新监控器
 * 支持 watch + callback 模式，配置变更时不重启生效
 */
export function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher {
  const interval = options.interval ?? 5000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentConfig: Record<string, unknown> = {};
  let watching = false;

  function hasChanged(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  return {
    start(initial: Record<string, unknown>): void {
      currentConfig = { ...initial };
      watching = true;
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      watching = false;
    },

    isWatching(): boolean {
      return watching;
    },

    async update(newConfig: Record<string, unknown>): Promise<void> {
      if (hasChanged(currentConfig, newConfig)) {
        const oldConfig = { ...currentConfig };
        currentConfig = { ...newConfig };
        await options.onChange(currentConfig, oldConfig);
      }
    },

    getConfig(): Record<string, unknown> {
      return { ...currentConfig };
    },
  };
}
