import { describe, expect, test } from 'bun:test';
import {
  buildCronExpression,
  describeCronExpression,
  isSupportedCronExpression,
} from '../CronExpressionPicker';

describe('CronExpressionPicker', () => {
  test('生成当前调度引擎支持的表达式', () => {
    expect(buildCronExpression('minute', 1)).toBe('* * * * *');
    expect(buildCronExpression('minutes', 5)).toBe('*/5 * * * *');
    expect(buildCronExpression('hour', 1)).toBe('0 * * * *');
    expect(buildCronExpression('hours', 3)).toBe('0 */3 * * *');
    expect(buildCronExpression('day', 1)).toBe('0 0 * * *');
  });

  test('拒绝 Quartz 六段表达式和当前无法准确执行的日期表达式', () => {
    expect(isSupportedCronExpression('0 0 2 * * ?')).toBe(false);
    expect(isSupportedCronExpression('0 2 * * *')).toBe(false);
    expect(isSupportedCronExpression('0 0 * * 1')).toBe(false);
  });

  test('提供用户可读的执行频率', () => {
    expect(describeCronExpression('*/10 * * * *')).toBe('每 10 分钟执行一次');
    expect(describeCronExpression('0 */6 * * *')).toBe('每 6 小时执行一次');
    expect(describeCronExpression('0 0 * * *')).toBe('每 24 小时执行一次');
  });
});
