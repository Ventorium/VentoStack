import { describe, expect, mock, test } from 'bun:test';
import { addContextSessionTenantSessionUnique } from './023_context_session_tenant_session_unique';

function recorder() {
  const calls: string[] = [];
  const executor = mock(async (sql: string) => {
    calls.push(sql);
    return [];
  });
  return { calls, executor };
}

describe('023_context_session_tenant_session_unique', () => {
  test('up 建 (tenant_id, session_id) 唯一索引，作为 upsertSession ON CONFLICT 目标', async () => {
    const { calls, executor } = recorder();
    await addContextSessionTenantSessionUnique.up(executor);

    const ddl = calls.find((s) => s.includes('CREATE UNIQUE INDEX'));
    expect(ddl).toBeDefined();
    expect(ddl).toContain('uq_ai_ctx_session_tenant_session');
    expect(ddl).toContain('ON ai_context_session (tenant_id, session_id)');
    // 幂等：重跑不报错
    expect(ddl).toContain('IF NOT EXISTS');
  });

  test('down 删除该索引', async () => {
    const { calls, executor } = recorder();
    await addContextSessionTenantSessionUnique.down(executor);

    const ddl = calls.find((s) => s.includes('DROP INDEX'));
    expect(ddl).toBeDefined();
    expect(ddl).toContain('uq_ai_ctx_session_tenant_session');
  });
});
