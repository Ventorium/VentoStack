import { describe, expect, test } from 'bun:test';
import { hardenIdentityIntegrity } from './015_harden_identity_integrity';

describe('015_harden_identity_integrity', () => {
  test('up adds active username uniqueness and identity foreign keys', async () => {
    const sql: string[] = [];
    await hardenIdentityIntegrity.up(async (text) => {
      sql.push(text);
      return [];
    });
    const joined = sql.join('\n');
    expect(joined).toContain('uq_sys_user_active_username');
    expect(joined).toContain('duplicate active usernames');
    expect(joined).toContain('orphaned identity relations');
    expect(joined).toContain('fk_sys_user_role_user');
    expect(joined).toContain('fk_sys_role_menu_menu');
    expect(joined).not.toContain('NOT VALID');
  });

  test('down removes all added constraints and the unique index', async () => {
    const sql: string[] = [];
    await hardenIdentityIntegrity.down(async (text) => {
      sql.push(text);
      return [];
    });
    expect(sql.join('\n')).toContain('DROP INDEX IF EXISTS uq_sys_user_active_username');
    expect(sql.filter((text) => text.includes('DROP CONSTRAINT IF EXISTS'))).toHaveLength(12);
  });
});
