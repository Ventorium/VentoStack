// @aeron/core - 多实例协调（k8s readiness / liveness）

export type InstanceState = "starting" | "ready" | "draining" | "stopped";

export interface InstanceCoordinator {
  getState(): InstanceState;
  setState(state: InstanceState): void;
  isReady(): boolean;
  isLive(): boolean;
  markDraining(): void;
  markReady(): void;
  markStopped(): void;
  getInstanceId(): string;
  getMetadata(): Record<string, unknown>;
  setMetadata(key: string, value: unknown): void;
}

/**
 * 创建实例协调器，管理当前实例的生命周期状态
 * 配合 k8s readiness/liveness probe 使用
 */
export function createInstanceCoordinator(instanceId?: string): InstanceCoordinator {
  let state: InstanceState = "starting";
  const id = instanceId ?? crypto.randomUUID();
  const metadata: Record<string, unknown> = {
    startedAt: Date.now(),
    pid: typeof process !== "undefined" ? process.pid : 0,
  };

  return {
    getState(): InstanceState {
      return state;
    },

    setState(newState: InstanceState): void {
      state = newState;
    },

    isReady(): boolean {
      return state === "ready";
    },

    isLive(): boolean {
      return state !== "stopped";
    },

    markDraining(): void {
      state = "draining";
    },

    markReady(): void {
      state = "ready";
    },

    markStopped(): void {
      state = "stopped";
    },

    getInstanceId(): string {
      return id;
    },

    getMetadata(): Record<string, unknown> {
      return { ...metadata };
    },

    setMetadata(key: string, value: unknown): void {
      metadata[key] = value;
    },
  };
}
