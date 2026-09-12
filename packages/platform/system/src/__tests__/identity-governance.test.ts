import { describe, expect, test } from 'bun:test';
import type { AuthUser } from '@ventostack/auth';
import { createIdentityGovernanceService } from '../services/identity-governance';
import { createMockDatabase, createMockExecutor } from './helpers';

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel } = createMockDatabase(mockExec);
  registerModel('sys_user_role', 'sys_user_role', false);
  registerModel('sys_role', 'sys_role', true);
  return { governance: createIdentityGovernanceService(db), results: mockExec.results };
}

const actor: AuthUser = { id: 'u1', username: 'operator', roles: ['admin'] };

describe('IdentityGovernanceService', () => {
  test('JWT 声称 admin 但数据库没有 admin 时拒绝控制面操作', async () => {
    const s = setup();
    s.results.set('SELECT role_id FROM sys_user_role', [{ role_id: 'r-editor' }]);
    s.results.set('AND code =', []);
    await expect(s.governance.assertActiveAdmin(actor)).rejects.toMatchObject({
      code: 403,
      errorCode: 'IDENTITY_GRANT_FORBIDDEN',
    });
  });

  test('非超管不能授予自己未持有的角色', async () => {
    const s = setup();
    s.results.set('SELECT role_id FROM sys_user_role', [{ role_id: 'r-editor' }]);
    s.results.set('AND code =', []);
    s.results.set('SELECT id FROM sys_role', [{ id: 'r-editor' }]);
    await expect(s.governance.assertCanAssignRoles(actor, ['r-admin'])).rejects.toThrow(
      '不能授予自身未持有的角色',
    );
  });

  test('非超管可以向下传递自己实际持有的启用角色', async () => {
    const s = setup();
    s.results.set('SELECT role_id FROM sys_user_role', [{ role_id: 'r-editor' }]);
    s.results.set('AND code =', []);
    s.results.set('SELECT id FROM sys_role', [{ id: 'r-editor' }]);
    await expect(s.governance.assertCanAssignRoles(actor, ['r-editor'])).resolves.toBeUndefined();
  });
});
