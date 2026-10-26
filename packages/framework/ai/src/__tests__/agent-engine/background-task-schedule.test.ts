import { describe, expect, test } from 'bun:test';
import {
  BackgroundScheduleError,
  computeNextRun,
  nextCronOccurrence,
  parseCron,
  validateSchedule,
} from '../../agent-engine/background-task-schedule';

/** 构造本地时间，避免测试依赖运行时区（与实现一致：按本地时区解释 cron） */
function at(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, second, 0);
}

describe('computeNextRun - once', () => {
  test('未来时间点返回该时间', () => {
    const from = at(2026, 10, 26, 22, 0);
    const next = computeNextRun({ kind: 'once', expr: '2026-10-27T09:30:00+08:00' }, from);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  test('过去的时间点返回 null（不再触发）', () => {
    expect(
      computeNextRun({ kind: 'once', expr: '2020-01-01T00:00:00+08:00' }, at(2026, 10, 26, 22, 0)),
    ).toBeNull();
  });

  test('非法时间字符串返回 null', () => {
    expect(computeNextRun({ kind: 'once', expr: 'not-a-date' }, new Date())).toBeNull();
  });
});

describe('computeNextRun - interval', () => {
  test('按分钟推进', () => {
    const from = at(2026, 10, 26, 22, 0);
    const next = computeNextRun({ kind: 'interval', expr: '10' }, from);
    expect(next!.getTime() - from.getTime()).toBe(10 * 60_000);
  });

  test('小于 1 分钟或非法值返回 null', () => {
    expect(computeNextRun({ kind: 'interval', expr: '0' }, new Date())).toBeNull();
    expect(computeNextRun({ kind: 'interval', expr: '1.5' }, new Date())).toBeNull();
    expect(computeNextRun({ kind: 'interval', expr: 'abc' }, new Date())).toBeNull();
  });
});

describe('parseCron', () => {
  test('解析通配字段', () => {
    const parsed = parseCron('* * * * *');
    expect(parsed.minutes.size).toBe(60);
    expect(parsed.hours.size).toBe(24);
    expect(parsed.domRestricted).toBe(false);
    expect(parsed.dowRestricted).toBe(false);
  });

  test('支持步长 / 范围 / 列表', () => {
    const parsed = parseCron('*/10 9-18 1,15 * 1-5');
    expect([...parsed.minutes].sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(parsed.hours.has(9)).toBe(true);
    expect(parsed.hours.has(18)).toBe(true);
    expect(parsed.hours.has(19)).toBe(false);
    expect([...parsed.daysOfMonth].sort((a, b) => a - b)).toEqual([1, 15]);
    expect(parsed.daysOfWeek.has(1)).toBe(true);
    expect(parsed.daysOfWeek.has(5)).toBe(true);
  });

  test('周字段 7 归一到 0（周日）', () => {
    const parsed = parseCron('0 9 * * 7');
    expect(parsed.daysOfWeek.has(0)).toBe(true);
    expect(parsed.daysOfWeek.has(7)).toBe(false);
  });

  test('非法表达式抛 BackgroundScheduleError', () => {
    expect(() => parseCron('* * *')).toThrow(BackgroundScheduleError);
    expect(() => parseCron('60 * * * *')).toThrow(BackgroundScheduleError);
    expect(() => parseCron('*/0 * * * *')).toThrow(BackgroundScheduleError);
    expect(() => parseCron('a * * * *')).toThrow(BackgroundScheduleError);
    expect(() => parseCron('1-0 * * * *')).toThrow(BackgroundScheduleError);
  });
});

describe('nextCronOccurrence', () => {
  test('每 10 分钟：命中下一个整十分钟', () => {
    const next = nextCronOccurrence(parseCron('*/10 * * * *'), at(2026, 10, 26, 22, 3));
    expect(next).toEqual(at(2026, 10, 26, 22, 10));
  });

  test('每天 9:30：跨天命中', () => {
    const next = nextCronOccurrence(parseCron('30 9 * * *'), at(2026, 10, 26, 22, 0));
    expect(next).toEqual(at(2026, 10, 27, 9, 30));
  });

  test('严格大于起点：起点正好命中时取下一次', () => {
    const next = nextCronOccurrence(parseCron('30 9 * * *'), at(2026, 10, 27, 9, 30));
    expect(next).toEqual(at(2026, 10, 28, 9, 30));
  });

  test('工作日 18:00：周五之后是下周一', () => {
    // 2026-10-30 是周五
    const next = nextCronOccurrence(parseCron('0 18 * * 1-5'), at(2026, 10, 30, 18, 0));
    expect(next).toEqual(at(2026, 11, 2, 18, 0));
  });

  test('日与周同时受限时按「或」匹配', () => {
    // 每月 15 号或每周一
    const next = nextCronOccurrence(parseCron('0 0 15 * 1'), at(2026, 10, 26, 22, 0));
    // 2026-11-02 是周一（11-15 更晚）
    expect(next).toEqual(at(2026, 11, 2, 0, 0));
  });

  test('月份限制：不在命中月份时跳到下个月', () => {
    const next = nextCronOccurrence(parseCron('0 0 1 12 *'), at(2026, 10, 26, 22, 0));
    expect(next).toEqual(at(2026, 12, 1, 0, 0));
  });
});

describe('validateSchedule', () => {
  test('合法配置不抛错', () => {
    const now = at(2026, 10, 26, 22, 0);
    expect(() => validateSchedule({ kind: 'once', expr: '2026-10-27T09:30:00+08:00' }, now)).not.toThrow();
    expect(() => validateSchedule({ kind: 'interval', expr: '10' }, now)).not.toThrow();
    expect(() => validateSchedule({ kind: 'cron', expr: '*/10 * * * *' }, now)).not.toThrow();
  });

  test('一次性任务必须晚于当前时间且不超过 366 天', () => {
    const now = at(2026, 10, 26, 22, 0);
    expect(() => validateSchedule({ kind: 'once', expr: '2026-10-26T21:00:00+08:00' }, now)).toThrow(
      BackgroundScheduleError,
    );
    expect(() => validateSchedule({ kind: 'once', expr: '2030-01-01T00:00:00+08:00' }, now)).toThrow(
      BackgroundScheduleError,
    );
  });

  test('间隔任务最小 1 分钟', () => {
    expect(() => validateSchedule({ kind: 'interval', expr: '0' }, new Date())).toThrow(
      BackgroundScheduleError,
    );
  });

  test('永不触发的 cron 在布置阶段就失败（fail-closed）', () => {
    // 2 月 30 日永远不会出现
    expect(() => validateSchedule({ kind: 'cron', expr: '0 0 30 2 *' }, new Date())).toThrow(
      BackgroundScheduleError,
    );
  });
});
