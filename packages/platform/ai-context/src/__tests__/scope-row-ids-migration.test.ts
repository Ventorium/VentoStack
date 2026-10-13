import { describe, expect, test } from 'bun:test';
import { scopeContextRowIds } from '../migrations/002_scope_context_row_ids';

/** 四张明细表：行 id 只在会话内唯一，主键必须是 (tenant_id, session_id, id) */
const TABLES = [
  'ai_context_node',
  'ai_context_request',
  'ai_context_event',
  'ai_context_file_op',
] as const;

describe('002_scope_ai_context_row_ids', () => {
  test('up 把每张明细表的主键收到 (tenant_id, session_id, id)', async () => {
    const sql: string[] = [];
    await scopeContextRowIds.up(async (text) => {
      sql.push(text);
      return [];
    });
    const joined = sql.join('\n');

    for (const table of TABLES) {
      // 先摘掉旧的单列主键，再建复合主键
      expect(joined).toContain(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_pkey`);
      expect(joined).toContain(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (tenant_id, session_id, id)`,
      );
    }
    // 不能漏表：四张表各出现一次主键重建
    const rebuilds = sql.filter((s) => s.includes('PRIMARY KEY (tenant_id, session_id, id)'));
    expect(rebuilds).toHaveLength(TABLES.length);
    // 顺序：先 drop 后 add，避免同表两条语句倒置导致约束叠加失败
    expect(joined.indexOf(`DROP CONSTRAINT IF EXISTS ${TABLES[0]}_pkey`)).toBeLessThan(
      joined.indexOf(`ADD CONSTRAINT ${TABLES[0]}_pkey`),
    );
  });

  test('down 退回 id 单列主键', async () => {
    const sql: string[] = [];
    await scopeContextRowIds.down(async (text) => {
      sql.push(text);
      return [];
    });
    const joined = sql.join('\n');
    for (const table of TABLES) {
      expect(joined).toContain(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (id)`,
      );
    }
  });
});
