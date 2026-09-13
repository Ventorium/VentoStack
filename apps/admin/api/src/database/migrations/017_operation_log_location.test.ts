import { describe, expect, test } from 'bun:test';
import { addOperationLogLocation } from './017_operation_log_location';

describe('017_operation_log_location', () => {
  test('up 增加操作日志位置字段', async () => {
    const statements: string[] = [];
    await addOperationLogLocation.up(async (sql) => {
      statements.push(String(sql));
      return [];
    });

    expect(statements.join('\n')).toContain(
      'ALTER TABLE sys_operation_log ADD COLUMN IF NOT EXISTS location VARCHAR(128)',
    );
  });
});
