// @aeron/events - 分布式事务（Saga 编排）

export interface SagaStep<T = unknown> {
  name: string;
  execute: (context: T) => Promise<T>;
  compensate: (context: T) => Promise<T>;
}

export type SagaStatus = "pending" | "running" | "completed" | "compensating" | "failed";

export interface SagaResult<T> {
  status: SagaStatus;
  context: T;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
}

export interface SagaOrchestrator<T> {
  addStep(step: SagaStep<T>): void;
  execute(initialContext: T): Promise<SagaResult<T>>;
  getSteps(): string[];
}

/**
 * 创建 Saga 编排器
 * 按顺序执行步骤，失败时按逆序补偿
 */
export function createSaga<T>(): SagaOrchestrator<T> {
  const steps: SagaStep<T>[] = [];

  return {
    addStep(step: SagaStep<T>): void {
      steps.push(step);
    },

    async execute(initialContext: T): Promise<SagaResult<T>> {
      const completedSteps: string[] = [];
      let context = initialContext;

      // 正向执行
      for (const step of steps) {
        try {
          context = await step.execute(context);
          completedSteps.push(step.name);
        } catch (err) {
          // 补偿已完成步骤（逆序）
          for (let i = completedSteps.length - 1; i >= 0; i--) {
            const compensateStep = steps.find((s) => s.name === completedSteps[i]);
            if (compensateStep) {
              try {
                context = await compensateStep.compensate(context);
              } catch {
                // 补偿失败，记录但继续
              }
            }
          }

          return {
            status: "failed",
            context,
            completedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return {
        status: "completed",
        context,
        completedSteps,
      };
    },

    getSteps(): string[] {
      return steps.map((s) => s.name);
    },
  };
}

// TCC (Try-Confirm-Cancel) 模式
export interface TCCStep<T = unknown> {
  name: string;
  try: (context: T) => Promise<T>;
  confirm: (context: T) => Promise<T>;
  cancel: (context: T) => Promise<T>;
}

export interface TCCOrchestrator<T> {
  addStep(step: TCCStep<T>): void;
  execute(initialContext: T): Promise<SagaResult<T>>;
}

/**
 * 创建 TCC 编排器
 * Try 阶段预留资源 → Confirm 阶段提交 → Cancel 阶段回滚
 */
export function createTCC<T>(): TCCOrchestrator<T> {
  const steps: TCCStep<T>[] = [];

  return {
    addStep(step: TCCStep<T>): void {
      steps.push(step);
    },

    async execute(initialContext: T): Promise<SagaResult<T>> {
      const triedSteps: string[] = [];
      let context = initialContext;

      // Try 阶段
      for (const step of steps) {
        try {
          context = await step.try(context);
          triedSteps.push(step.name);
        } catch (err) {
          // Cancel 已 try 的步骤
          for (let i = triedSteps.length - 1; i >= 0; i--) {
            const cancelStep = steps.find((s) => s.name === triedSteps[i]);
            if (cancelStep) {
              try {
                context = await cancelStep.cancel(context);
              } catch {
                // Cancel 失败，记录但继续
              }
            }
          }
          return {
            status: "failed",
            context,
            completedSteps: triedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Confirm 阶段
      const confirmedSteps: string[] = [];
      for (const step of steps) {
        try {
          context = await step.confirm(context);
          confirmedSteps.push(step.name);
        } catch (err) {
          // Confirm 失败 — 需要补偿
          return {
            status: "failed",
            context,
            completedSteps: confirmedSteps,
            failedStep: step.name,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return {
        status: "completed",
        context,
        completedSteps: confirmedSteps,
      };
    },
  };
}
