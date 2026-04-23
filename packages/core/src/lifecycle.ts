// @ventostack/core - 生命周期管理

/** 生命周期钩子函数 */
export type LifecycleHook = () => Promise<void> | void;

interface PrioritizedLifecycleHook {
  hook: LifecycleHook;
  priority: number;
  order: number;
}

/** 生命周期管理器接口 */
export interface Lifecycle {
  /**
   * 注册启动前钩子
   * @param hook - 钩子函数
   */
  onBeforeStart(hook: LifecycleHook): void;
  /**
   * 注册启动后钩子
   * @param hook - 钩子函数
   */
  onAfterStart(hook: LifecycleHook): void;
  /**
   * 注册路由编译前钩子
   * @param hook - 钩子函数
   * @param priority - 执行优先级，数值越大越晚执行
   */
  onBeforeRouteCompile(hook: LifecycleHook, priority?: number): void;
  /**
   * 注册停止前钩子
   * @param hook - 钩子函数
   */
  onBeforeStop(hook: LifecycleHook): void;
  /** 执行启动前钩子 */
  runBeforeStart(): Promise<void>;
  /** 执行路由编译前钩子 */
  runBeforeRouteCompile(): Promise<void>;
  /** 执行启动后钩子 */
  runAfterStart(): Promise<void>;
  /** 执行停止前钩子 */
  runBeforeStop(): Promise<void>;
}

/**
 * 创建生命周期管理器
 * @returns Lifecycle 实例
 */
export function createLifecycle(): Lifecycle {
  const beforeStartHooks: LifecycleHook[] = [];
  const beforeRouteCompileHooks: PrioritizedLifecycleHook[] = [];
  const afterStartHooks: LifecycleHook[] = [];
  const beforeStopHooks: LifecycleHook[] = [];
  let hookOrder = 0;

  async function runHooks(hooks: LifecycleHook[]): Promise<void> {
    for (const hook of hooks) {
      await hook();
    }
  }

  async function runPrioritizedHooks(hooks: PrioritizedLifecycleHook[]): Promise<void> {
    const sortedHooks = [...hooks].sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.order - right.order;
    });

    for (const entry of sortedHooks) {
      await entry.hook();
    }
  }

  return {
    onBeforeStart(hook: LifecycleHook): void {
      beforeStartHooks.push(hook);
    },

    onAfterStart(hook: LifecycleHook): void {
      afterStartHooks.push(hook);
    },

    onBeforeRouteCompile(hook: LifecycleHook, priority = 0): void {
      beforeRouteCompileHooks.push({ hook, priority, order: hookOrder++ });
    },

    onBeforeStop(hook: LifecycleHook): void {
      beforeStopHooks.push(hook);
    },

    runBeforeStart(): Promise<void> {
      return runHooks(beforeStartHooks);
    },

    runBeforeRouteCompile(): Promise<void> {
      return runPrioritizedHooks(beforeRouteCompileHooks);
    },

    runAfterStart(): Promise<void> {
      return runHooks(afterStartHooks);
    },

    runBeforeStop(): Promise<void> {
      return runHooks(beforeStopHooks);
    },
  };
}
