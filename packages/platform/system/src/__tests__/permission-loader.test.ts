/**
 * @ventostack/system - PermissionLoader 测试
 */

import { describe, expect, test } from 'bun:test';
import { createPermissionLoader } from '../services/permission-loader';
import { createMockDatabase, createMockExecutor, createMockRBAC } from './helpers';

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel('sys_role', 'sys_role', true);
  registerModel('sys_role_menu', 'sys_role_menu', false);
  registerModel('sys_menu', 'sys_menu', true);
  const rbac = createMockRBAC();
  const permissionLoader = createPermissionLoader({ db, rbac });
  return {
    permissionLoader,
    executor: mockExec.executor,
    calls,
    results: mockExec.results,
    rbac,
  };
}

describe('PermissionLoader', () => {
  test('loadAll loads all roles and their permissions', async () => {
    const s = setup();
    s.results.clear();
    s.results.set('sys_role WHERE status', [{ id: 'r1', code: 'admin' }]);
    s.results.set('sys_role_menu', [{ permission: 'system:user:list' }]);

    await s.permissionLoader.loadAll();
    expect(s.rbac.addRole).toHaveBeenCalled();
  });

  test('loadAll with no roles still completes', async () => {
    const s = setup();
    s.results.set('sys_role WHERE status', []);
    await s.permissionLoader.loadAll();
    // No roles to add
    expect(s.rbac.addRole).not.toHaveBeenCalled();
  });

  test('reloadRole reloads specific role permissions', async () => {
    const s = setup();
    s.results.set('code = $1', [{ id: 'r1' }]);
    s.results.set('sys_role_menu', [{ permission: 'system:user:create' }]);
    await s.permissionLoader.reloadRole('admin');
    expect(s.rbac.addRole).toHaveBeenCalled();
  });

  test('reloadRole removes role if not found', async () => {
    const s = setup();
    // No roles found for the given code
    await s.permissionLoader.reloadRole('nonexistent');
    expect(s.rbac.removeRole).toHaveBeenCalledWith('nonexistent');
  });

  test('reloadAll clears existing roles and reloads', async () => {
    const s = setup();
    s.results.set('sys_role WHERE status', [{ id: 'r1', code: 'admin' }]);
    s.results.set('sys_role_menu', [{ permission: 'system:user:list' }]);

    await s.permissionLoader.reloadAll();
    // Should clear existing roles first
    expect(s.rbac.listRoles).toHaveBeenCalled();
  });
});
