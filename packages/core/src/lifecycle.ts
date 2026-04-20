// @aeron/core - 生命周期管理

export type LifecycleHook = () => Promise<void> | void;

export interface Lifecycle {
  onBeforeStart(hook: LifecycleHook): void;
  onAfterStart(hook: LifecycleHook): void;
  onBeforeStop(hook: LifecycleHook): void;
  runBeforeStart(): Promise<void>;
  runAfterStart(): Promise<void>;
  runBeforeStop(): Promise<void>;
}

export function createLifecycle(): Lifecycle {
  const beforeStartHooks: LifecycleHook[] = [];
  const afterStartHooks: LifecycleHook[] = [];
  const beforeStopHooks: LifecycleHook[] = [];

  async function runHooks(hooks: LifecycleHook[]): Promise<void> {
    for (const hook of hooks) {
      await hook();
    }
  }

  return {
    onBeforeStart(hook: LifecycleHook): void {
      beforeStartHooks.push(hook);
    },

    onAfterStart(hook: LifecycleHook): void {
      afterStartHooks.push(hook);
    },

    onBeforeStop(hook: LifecycleHook): void {
      beforeStopHooks.push(hook);
    },

    runBeforeStart(): Promise<void> {
      return runHooks(beforeStartHooks);
    },

    runAfterStart(): Promise<void> {
      return runHooks(afterStartHooks);
    },

    runBeforeStop(): Promise<void> {
      return runHooks(beforeStopHooks);
    },
  };
}
