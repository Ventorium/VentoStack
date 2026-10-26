/**
 * 后台任务（脚本 / 定时唤醒）前端类型与展示辅助
 *
 * 后端实体是 snake_case，接口经拦截器拆信封后是 camelCase（service 层已映射）。
 */

export type BackgroundTaskKind = 'script' | 'schedule';

export type BackgroundTaskStatus =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export type BackgroundRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'interrupted';

export type BackgroundRunTrigger = 'start' | 'schedule' | 'completion' | 'manual' | 'condition';

export interface BackgroundTaskItem {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  title: string;
  kind: BackgroundTaskKind;
  status: BackgroundTaskStatus;
  command: string | null;
  conditionCommand: string | null;
  prompt: string | null;
  schedule: { kind: 'once' | 'interval' | 'cron'; expr: string } | null;
  resumeOnFinish: boolean;
  notifyOnFinish: boolean;
  maxRuns: number;
  runCount: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastError: string | null;
  instanceId: string | null;
  sandboxId: string | null;
  execPid: string | null;
  execLogPath: string | null;
  execExitPath: string | null;
  /** 脚本最大运行时长（秒）；null = 不限制 */
  maxRuntimeSeconds: number | null;
  /** 脚本执行截止时间（超时兜底） */
  deadlineAt: string | null;
  /** 定时任务有效期（到期自动结束） */
  expiresAt: string | null;
  /** 连续失败次数（达到阈值自动暂停） */
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundTaskRunItem {
  id: string;
  taskId: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  trigger: BackgroundRunTrigger;
  status: BackgroundRunStatus;
  scheduledAt: string | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  output: string | null;
  error: string | null;
  finalContent: string | null;
}

/** 状态展示口径：颜色遵循 antd Tag 语义 */
export const TASK_STATUS_META: Record<
  BackgroundTaskStatus,
  { label: string; color: string; active: boolean }
> = {
  pending: { label: '待启动', color: 'blue', active: true },
  waiting: { label: '等待触发', color: 'cyan', active: true },
  running: { label: '执行中', color: 'processing', active: true },
  paused: { label: '已暂停', color: 'default', active: false },
  completed: { label: '已完成', color: 'green', active: false },
  failed: { label: '失败', color: 'red', active: false },
  cancelled: { label: '已取消', color: 'default', active: false },
  interrupted: { label: '已中断', color: 'orange', active: false },
};

export const RUN_STATUS_META: Record<BackgroundRunStatus, { label: string; color: string }> = {
  running: { label: '执行中', color: 'processing' },
  completed: { label: '成功', color: 'green' },
  failed: { label: '失败', color: 'red' },
  skipped: { label: '已跳过', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  interrupted: { label: '已中断', color: 'orange' },
};

export const RUN_TRIGGER_LABEL: Record<BackgroundRunTrigger, string> = {
  start: '启动脚本',
  schedule: '定时唤醒',
  completion: '完成唤醒',
  manual: '手动执行',
  condition: '条件检查',
};

/** 任务是否处于活跃态（会随时间推进） */
export function isActiveTask(task: BackgroundTaskItem): boolean {
  return TASK_STATUS_META[task.status].active;
}

/** 调度规则的人类可读描述 */
export function formatSchedule(task: BackgroundTaskItem): string {
  if (task.kind === 'script') return '一次性脚本';
  const schedule = task.schedule;
  if (!schedule) return '—';
  if (schedule.kind === 'once') return `一次性（${formatDateTime(schedule.expr)}）`;
  if (schedule.kind === 'interval') return `每 ${schedule.expr} 分钟`;
  return `cron：${schedule.expr}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 距离下次触发的倒计时描述 */
export function formatNextRun(task: BackgroundTaskItem): string {
  if (!task.nextRunAt) return '—';
  const diff = new Date(task.nextRunAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return '—';
  if (diff <= 0) return '即将触发';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.round(hours / 24)} 天后`;
}
