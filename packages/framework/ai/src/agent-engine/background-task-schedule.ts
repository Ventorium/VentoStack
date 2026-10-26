/**
 * 后台任务调度表达式（纯函数，无 IO）
 *
 * 三种调度：
 *   - once：一次性时间点（ISO 8601）
 *   - interval：固定间隔（分钟）
 *   - cron：标准 5 段表达式（分 时 日 月 周）；支持 `*`、步长（星号/数字后再跟斜杠 n）、`a-b`、
 *     `a-b/n`、逗号列表；周字段 0/7 = 周日；日与周同时受限时按「或」匹配（与 Vixie cron 一致）。
 *
 * 为什么不用 @ventostack/events 的 parseCronToInterval：它只把少数几种表达式折算成
 * 固定间隔，无法表达「每天 9:30」「工作日 18:00」这类日历语义，达不到「定时唤醒会话」的需求。
 */

export type BackgroundScheduleKind = 'once' | 'interval' | 'cron';

export interface BackgroundSchedule {
  kind: BackgroundScheduleKind;
  /** once = ISO 时间字符串；interval = 分钟数；cron = 5 段表达式 */
  expr: string;
}

/** 失败原因（供路由/工具返回可读错误） */
export class BackgroundScheduleError extends Error {
  readonly code = 'BACKGROUND_SCHEDULE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'BackgroundScheduleError';
  }
}

/** 间隔调度允许的最小间隔：1 分钟（避免无意义的秒级轮询放大 LLM 成本） */
export const MIN_INTERVAL_MINUTES = 1;
/** 一次性任务允许的最大提前量：366 天 */
const MAX_ONCE_AHEAD_MS = 366 * 24 * 3_600_000;
/** cron 向后搜索上限：366 天（超过视为「永不触发」，调用方按失败处理） */
const CRON_SEARCH_DAYS = 366;

const FIELD_RANGES: Record<string, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 7],
};

function parseNumbers(field: string, name: string, raw: string): Set<number> {
  const [min, max] = FIELD_RANGES[name]!;
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (!part) throw new BackgroundScheduleError(`cron 字段为空：${raw}`);
    const [rangePart, stepPart] = part.split('/');
    if (stepPart !== undefined) {
      const step = Number(stepPart);
      if (!Number.isInteger(step) || step <= 0) {
        throw new BackgroundScheduleError(`cron 步长非法：${raw}`);
      }
      const [start, end] = parseRange(rangePart!, name, raw, min, max);
      for (let value = start; value <= end; value += step) out.add(value);
      continue;
    }
    const [start, end] = parseRange(rangePart!, name, raw, min, max);
    for (let value = start; value <= end; value += 1) out.add(value);
  }
  if (name === 'dayOfWeek') {
    // 0 与 7 都表示周日，统一归一到 0
    if (out.has(7)) {
      out.delete(7);
      out.add(0);
    }
  }
  return out;
}

function parseRange(
  part: string,
  name: string,
  raw: string,
  min: number,
  max: number,
): [number, number] {
  if (part === '*') return [min, max];
  const match = part.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) throw new BackgroundScheduleError(`cron 字段非法：${raw}`);
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  if (start < min || end > max || start > end) {
    throw new BackgroundScheduleError(`cron 取值超出范围 [${min}, ${max}]：${raw}`);
  }
  return [start, end];
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** 日与周字段是否同时受限（受限时按「或」匹配） */
  domRestricted: boolean;
  dowRestricted: boolean;
  raw: string;
}

/** 解析 5 段 cron 表达式；非法表达式抛 BackgroundScheduleError */
export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new BackgroundScheduleError(`cron 表达式必须为 5 段（分 时 日 月 周），实际：${expr}`);
  }
  return {
    minutes: parseNumbers(parts[0]!, 'minute', expr),
    hours: parseNumbers(parts[1]!, 'hour', expr),
    daysOfMonth: parseNumbers(parts[2]!, 'dayOfMonth', expr),
    months: parseNumbers(parts[3]!, 'month', expr),
    daysOfWeek: parseNumbers(parts[4]!, 'dayOfWeek', expr),
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*',
    raw: expr,
  };
}

/** 校验调度配置；失败抛 BackgroundScheduleError */
export function validateSchedule(schedule: BackgroundSchedule, now = new Date()): void {
  if (schedule.kind === 'once') {
    const at = Date.parse(schedule.expr);
    if (!Number.isFinite(at)) {
      throw new BackgroundScheduleError(`一次性任务时间不是合法的 ISO 时间：${schedule.expr}`);
    }
    if (at <= now.getTime()) {
      throw new BackgroundScheduleError('一次性任务的执行时间必须晚于当前时间');
    }
    if (at - now.getTime() > MAX_ONCE_AHEAD_MS) {
      throw new BackgroundScheduleError('一次性任务的执行时间不能超过 366 天');
    }
    return;
  }
  if (schedule.kind === 'interval') {
    const minutes = Number(schedule.expr);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES) {
      throw new BackgroundScheduleError(
        `间隔调度必须以分钟为单位且不小于 ${MIN_INTERVAL_MINUTES}：${schedule.expr}`,
      );
    }
    if (minutes > 60 * 24 * 366) {
      throw new BackgroundScheduleError('间隔调度不能超过 366 天');
    }
    return;
  }
  if (schedule.kind === 'cron') {
    // 解析即校验；另外确认未来能命中，避免布置一个永不触发的任务
    const parsed = parseCron(schedule.expr);
    if (nextCronOccurrence(parsed, now) === null) {
      throw new BackgroundScheduleError(`cron 表达式在未来一年内不会触发：${schedule.expr}`);
    }
    return;
  }
  throw new BackgroundScheduleError(
    `不支持的调度类型：${String((schedule as { kind: string }).kind)}`,
  );
}

/**
 * 计算下一次执行时间；返回 null 表示不会再触发（一次性任务已过期 / cron 一年内无命中）。
 * `from` 为当前时间（含），返回值严格大于 from。
 */
export function computeNextRun(schedule: BackgroundSchedule, from = new Date()): Date | null {
  if (schedule.kind === 'once') {
    const at = Date.parse(schedule.expr);
    if (!Number.isFinite(at) || at <= from.getTime()) return null;
    return new Date(at);
  }
  if (schedule.kind === 'interval') {
    const minutes = Number(schedule.expr);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES) return null;
    return new Date(from.getTime() + minutes * 60_000);
  }
  if (schedule.kind === 'cron') {
    return nextCronOccurrence(parseCron(schedule.expr), from);
  }
  return null;
}

/** cron 下一次命中（按本地时区计算，与用户看到的「每天 9:30」一致） */
export function nextCronOccurrence(parsed: ParsedCron, from: Date): Date | null {
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  // 从下一分钟起找，保证严格大于 from
  start.setMinutes(start.getMinutes() + 1);
  const limit = new Date(from.getTime() + CRON_SEARCH_DAYS * 24 * 3_600_000);
  const cursor = new Date(start.getTime());

  while (cursor.getTime() <= limit.getTime()) {
    if (!parsed.months.has(cursor.getMonth() + 1)) {
      // 整月跳过：直接到下一个月的 1 日 00:00
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    const dayMatches = matchDay(parsed, cursor);
    if (!dayMatches) {
      // 整天跳过
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    const hour = cursor.getHours();
    if (!parsed.hours.has(hour)) {
      cursor.setHours(hour + 1, 0, 0, 0);
      continue;
    }
    const minute = cursor.getMinutes();
    if (!parsed.minutes.has(minute)) {
      cursor.setMinutes(minute + 1, 0, 0);
      continue;
    }
    return new Date(cursor.getTime());
  }
  return null;
}

function matchDay(parsed: ParsedCron, date: Date): boolean {
  const domMatched = parsed.daysOfMonth.has(date.getDate());
  const dowMatched = parsed.daysOfWeek.has(date.getDay());
  if (parsed.domRestricted && parsed.dowRestricted) return domMatched || dowMatched;
  if (parsed.domRestricted) return domMatched;
  if (parsed.dowRestricted) return dowMatched;
  return true;
}
