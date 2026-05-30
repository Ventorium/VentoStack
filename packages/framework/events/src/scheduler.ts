/**
 * @ventostack/events - 简单任务调度器
 * 支持间隔执行与基础 Cron 表达式解析，任务错误不会导致调度器崩溃
 * 适用于定时任务、周期性数据同步、缓存预热等场景
 */

/** 调度配置选项 */
export interface ScheduleOptions {
  /** 任务名称 */
  name: string;
  /** Cron 表达式（简化为间隔解析） */
  cron?: string;
  /** 执行间隔（毫秒） */
  interval?: number;
  /** 是否在注册时立即执行一次 */
  immediate?: boolean;
  /** 任务执行前的钩子 */
  onBeforeExecute?: (task: { name: string; scheduledAt: number }) => Promise<void>;
  /** 任务执行成功后的钩子 */
  onAfterExecute?: (task: { name: string; duration: number }) => Promise<void>;
  /** 任务执行出错时的钩子 */
  onError?: (task: { name: string; error: Error; duration: number }) => Promise<void>;
}

/** 已调度任务 */
export interface ScheduledTask {
  /** 任务名称 */
  readonly name: string;
  /** 停止任务 */
  stop(): void;
  /** 是否正在运行 */
  readonly running: boolean;
}

/** 调度器接口 */
export interface Scheduler {
  /**
   * 调度任务
   * @param options 调度配置
   * @param handler 任务处理器
   * @returns 已调度任务对象
   */
  schedule(options: ScheduleOptions, handler: () => Promise<void> | void): ScheduledTask;

  /** 停止所有已调度任务 */
  stopAll(): void;

  /**
   * 列出所有已调度任务
   * @returns 任务列表
   */
  list(): ReadonlyArray<ScheduledTask>;
}

/**
 * 将简化的 Cron 表达式解析为毫秒间隔
 *
 * 支持的子集模式：
 *  - `* * * * *`        → 每分钟 (60_000)
 *  - `* /N * * * *`      → 每 N 分钟
 *  - `0 * * * *`        → 每小时
 *  - `0 0 * * *`        → 每天 (24h)
 *  - `0 * /N * * *`      → 每 N 小时
 *
 * 其他格式回退到 60_000（1 分钟）
 * @param cron Cron 表达式字符串
 * @returns 间隔毫秒数
 */
export function parseCronToInterval(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 60_000;

  const [minute, hour] = parts;

  // Every N minutes: `*/N * * * *`
  if (minute?.startsWith("*/")) {
    const n = Number.parseInt(minute.slice(2), 10);
    if (n > 0) return n * 60_000;
  }

  // Every N hours: `0 */N * * *`
  if (minute === "0" && hour !== undefined && hour.startsWith("*/")) {
    const n = Number.parseInt(hour.slice(2), 10);
    if (n > 0) return n * 3_600_000;
  }

  // Every minute: `* * * * *`
  if (minute === "*" && hour === "*") return 60_000;

  // Every hour: `0 * * * *`
  if (minute === "0" && hour === "*") return 3_600_000;

  // Every day: `0 0 * * *`
  if (minute === "0" && hour === "0") return 86_400_000;

  return 60_000;
}

/**
 * 创建任务调度器实例
 * 基于 setInterval 实现，任务错误不会导致调度器崩溃
 * @returns 调度器实例
 */
export function createScheduler(): Scheduler {
  const tasks: ScheduledTask[] = [];

  function schedule(options: ScheduleOptions, handler: () => Promise<void> | void): ScheduledTask {
    const { name, cron, interval, immediate } = options;

    if (cron === undefined && interval === undefined) {
      throw new Error(`Schedule "${name}" must specify either "cron" or "interval".`);
    }

    const ms = interval ?? parseCronToInterval(cron!);
    let _running = true;

    const safeHandler = async () => {
      if (!_running) return;
      const start = Date.now();
      try {
        if (options.onBeforeExecute)
          await options.onBeforeExecute({ name: options.name, scheduledAt: start });
        await handler();
        const duration = Date.now() - start;
        if (options.onAfterExecute) await options.onAfterExecute({ name: options.name, duration });
      } catch (err) {
        const duration = Date.now() - start;
        if (options.onError)
          await options.onError({ name: options.name, error: err as Error, duration });
      }
    };

    const timer = setInterval(safeHandler, ms);

    const task: ScheduledTask = {
      name,
      get running() {
        return _running;
      },
      stop() {
        if (!_running) return;
        _running = false;
        clearInterval(timer);
      },
    };

    tasks.push(task);

    if (immediate) {
      // Fire-and-forget; errors are swallowed inside safeHandler.
      void safeHandler();
    }

    return task;
  }

  function stopAll(): void {
    for (const task of tasks) {
      task.stop();
    }
  }

  function list(): ReadonlyArray<ScheduledTask> {
    return tasks;
  }

  return { schedule, stopAll, list };
}
