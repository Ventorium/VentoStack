import { describe, expect, test } from 'bun:test';
import { tenantScopeSystemTables } from './016_tenant_scope_system_tables';

describe('016_tenant_scope_system_tables', () => {
  test('up scopes every system table and enforces same-tenant relations', async () => {
    const sql: string[] = [];
    await tenantScopeSystemTables.up(async (text) => {
      sql.push(text);
      return [];
    });
    const joined = sql.join('\n');
    expect(joined).toContain('ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS tenant_id');
    expect(joined).toContain('ALTER TABLE sys_operation_log ADD COLUMN IF NOT EXISTS tenant_id');
    expect(joined).toContain("UPDATE sys_user SET tenant_id = 'default' WHERE tenant_id IS NULL");
    expect(joined).toContain('ALTER TABLE sys_user ALTER COLUMN tenant_id SET NOT NULL');
    expect(joined).toContain('uq_sys_user_tenant_active_username');
    expect(joined).toContain('uq_sys_config_tenant_key');
    expect(joined).toContain('fk_sys_user_role_tenant_user');
    expect(joined).toContain('fk_sys_user_role_tenant_role');
    expect(joined).toContain('fk_sys_dict_data_tenant_type');
    expect(joined).toContain('ON DELETE SET NULL (dept_id)');
  });

  test('down removes tenant constraints before columns and restores legacy uniqueness', async () => {
    const sql: string[] = [];
    await tenantScopeSystemTables.down(async (text) => {
      sql.push(text);
      return [];
    });
    const joined = sql.join('\n');
    expect(joined.indexOf('DROP CONSTRAINT IF EXISTS fk_sys_user_role_tenant_user')).toBeLessThan(
      joined.indexOf('DROP COLUMN IF EXISTS tenant_id'),
    );
    expect(joined).toContain('CREATE UNIQUE INDEX uq_sys_user_active_username');
    expect(joined).toContain('ADD CONSTRAINT sys_role_code_key UNIQUE (code)');
  });
});
