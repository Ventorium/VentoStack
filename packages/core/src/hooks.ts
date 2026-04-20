// @aeron/core - 自定义 Hook 系统

export type HookCallback<T = unknown> = (data: T) => void | Promise<void>;

export interface HookRegistry {
  /** 注册 hook 监听 */
  on<T = unknown>(hookName: string, callback: HookCallback<T>): () => void;
  /** 触发 hook */
  emit<T = unknown>(hookName: string, data: T): Promise<void>;
  /** 注册一次性 hook */
  once<T = unknown>(hookName: string, callback: HookCallback<T>): () => void;
  /** 移除所有某个 hook 的监听 */
  off(hookName: string): void;
  /** 列出所有已注册的 hook 名称 */
  hooks(): string[];
}

export function createHookRegistry(): HookRegistry {
  const listeners = new Map<string, Array<{ callback: HookCallback; once: boolean }>>();

  function on<T = unknown>(hookName: string, callback: HookCallback<T>, isOnce = false): () => void {
    if (!listeners.has(hookName)) {
      listeners.set(hookName, []);
    }
    const entry = { callback: callback as HookCallback, once: isOnce };
    listeners.get(hookName)!.push(entry);

    return () => {
      const arr = listeners.get(hookName);
      if (arr) {
        const idx = arr.indexOf(entry);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
  }

  return {
    on<T = unknown>(hookName: string, callback: HookCallback<T>) {
      return on(hookName, callback, false);
    },

    async emit<T = unknown>(hookName: string, data: T) {
      const arr = listeners.get(hookName);
      if (!arr || arr.length === 0) return;

      const toRemove: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        await arr[i]!.callback(data);
        if (arr[i]!.once) toRemove.push(i);
      }
      // 逆序移除 once 监听
      for (let i = toRemove.length - 1; i >= 0; i--) {
        arr.splice(toRemove[i]!, 1);
      }
    },

    once<T = unknown>(hookName: string, callback: HookCallback<T>) {
      return on(hookName, callback, true);
    },

    off(hookName: string) {
      listeners.delete(hookName);
    },

    hooks() {
      return [...listeners.keys()];
    },
  };
}
