/**
 * Simple task scheduler supporting interval and basic cron expressions.
 */

export interface ScheduleOptions {
  name: string;
  /** Cron expression — parsed into an interval (simplified). */
  cron?: string;
  /** Interval in milliseconds. */
  interval?: number;
  /** Whether to execute the handler immediately on schedule. */
  immediate?: boolean;
}

export interface ScheduledTask {
  readonly name: string;
  stop(): void;
  readonly running: boolean;
}

export interface Scheduler {
  schedule(options: ScheduleOptions, handler: () => Promise<void> | void): ScheduledTask;
  stopAll(): void;
  list(): ReadonlyArray<ScheduledTask>;
}

/**
 * Parse a simplified cron expression into an interval in milliseconds.
 *
 * Supported patterns (subset):
 *  - `* * * * *`        → every minute (60_000)
 *  - `*​/N * * * *`      → every N minutes
 *  - `0 * * * *`        → every hour
 *  - `0 0 * * *`        → every day (24h)
 *  - `0 *​/N * * *`      → every N hours
 *
 * For anything else, falls back to 60_000 (1 minute).
 */
export function parseCronToInterval(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 60_000;

  const [minute, hour] = parts;

  // Every N minutes: `*/N * * * *`
  if (minute !== undefined && minute.startsWith("*/")) {
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
      try {
        await handler();
      } catch {
        // Swallow — a single task error must not crash the scheduler.
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
