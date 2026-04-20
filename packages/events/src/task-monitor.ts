// @aeron/events - 任务可观测（状态 / retry / logs）

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "retrying" | "timeout";

export interface TaskLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

export interface TaskRecord {
  id: string;
  name: string;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  error?: string;
  logs: TaskLogEntry[];
}

export interface TaskMonitor {
  track(id: string, name: string, maxAttempts?: number): void;
  start(id: string): void;
  complete(id: string): void;
  fail(id: string, error: string): void;
  retry(id: string): void;
  log(id: string, level: TaskLogEntry["level"], message: string, meta?: Record<string, unknown>): void;
  get(id: string): TaskRecord | undefined;
  list(filter?: { status?: TaskStatus; name?: string }): TaskRecord[];
  stats(): { total: number; running: number; completed: number; failed: number; pending: number };
  clear(): void;
}

/**
 * 创建任务监控器
 */
export function createTaskMonitor(): TaskMonitor {
  const tasks = new Map<string, TaskRecord>();

  return {
    track(id: string, name: string, maxAttempts = 3): void {
      tasks.set(id, {
        id,
        name,
        status: "pending",
        attempts: 0,
        maxAttempts,
        logs: [],
      });
    },

    start(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "running";
      task.startedAt = Date.now();
      task.attempts++;
      task.logs.push({ timestamp: Date.now(), level: "info", message: `Task started (attempt ${task.attempts})` });
    },

    complete(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "completed";
      task.completedAt = Date.now();
      task.duration = task.startedAt ? task.completedAt - task.startedAt : 0;
      task.logs.push({ timestamp: Date.now(), level: "info", message: "Task completed" });
    },

    fail(id: string, error: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "failed";
      task.error = error;
      task.completedAt = Date.now();
      task.duration = task.startedAt ? task.completedAt - task.startedAt : 0;
      task.logs.push({ timestamp: Date.now(), level: "error", message: `Task failed: ${error}` });
    },

    retry(id: string): void {
      const task = tasks.get(id);
      if (!task) return;
      task.status = "retrying";
      task.logs.push({ timestamp: Date.now(), level: "warn", message: `Retrying task (attempt ${task.attempts + 1})` });
    },

    log(id: string, level: TaskLogEntry["level"], message: string, meta?: Record<string, unknown>): void {
      const task = tasks.get(id);
      if (!task) return;
      task.logs.push({ timestamp: Date.now(), level, message, meta });
    },

    get(id: string): TaskRecord | undefined {
      return tasks.get(id);
    },

    list(filter?: { status?: TaskStatus; name?: string }): TaskRecord[] {
      let result = Array.from(tasks.values());
      if (filter?.status) result = result.filter((t) => t.status === filter.status);
      if (filter?.name) result = result.filter((t) => t.name === filter.name);
      return result;
    },

    stats() {
      const all = Array.from(tasks.values());
      return {
        total: all.length,
        running: all.filter((t) => t.status === "running").length,
        completed: all.filter((t) => t.status === "completed").length,
        failed: all.filter((t) => t.status === "failed").length,
        pending: all.filter((t) => t.status === "pending").length,
      };
    },

    clear(): void {
      tasks.clear();
    },
  };
}
