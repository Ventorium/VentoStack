import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { MenuModel, RoleMenuModel, RoleModel } from '@ventostack/system';
import { OAuthApplicationModel } from '../models';
import {
  type ApplicationMenuInput,
  createOAuthApplicationMenuService,
} from '../services/application-menu';

const input: ApplicationMenuInput = {
  parentId: null,
  name: '任务',
  path: '/task',
  component: 'TaskPage',
  redirect: null,
  type: 2,
  permission: 'task:list',
  icon: 'List',
  sort: 1,
  visible: true,
  status: 1,
  roleIds: ['role-1', 'role-1'],
};

function fixture(children = 0) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const batches: Array<Record<string, unknown>[]> = [];
  let deleted = 0;
  const db = {
    query: (model: unknown) => {
      const builder = {
        where: () => builder,
        select: () => builder,
        orderBy: () => builder,
        get: async () => ({ id: model === OAuthApplicationModel ? 'app-1' : 'menu-1' }),
        list: async () => {
          if (model === MenuModel)
            return [
              { id: 'root', parent_id: null, name: '根菜单', sort: 0 },
              { id: 'child', parent_id: 'root', name: '子菜单', sort: 1 },
            ];
          if (model === RoleMenuModel) return [{ menu_id: 'child', role_id: 'role-1' }];
          if (model === RoleModel) return [{ id: 'role-1' }];
          return [];
        },
        count: async () => children,
        insert: async (value: Record<string, unknown>) => inserts.push(value),
        update: async (value: Record<string, unknown>) => updates.push(value),
        batchInsert: async (value: Array<Record<string, unknown>>) => batches.push(value),
        hardDelete: async () => {
          deleted += 1;
        },
      };
      return builder;
    },
    transaction: async (fn: (tx: Database) => Promise<void>) => fn(db as unknown as Database),
  } as unknown as Database;
  return {
    service: createOAuthApplicationMenuService({ db, tenantId: 'tenant-1' }),
    inserts,
    updates,
    batches,
    deleted: () => deleted,
  };
}

describe('OAuth application menu service', () => {
  test('builds a tree and attaches tenant-scoped role assignments', async () => {
    const tree = await fixture().service.list('app-1');
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 'root', role_ids: [] });
    expect(tree[0]!.children![0]).toMatchObject({ id: 'child', role_ids: ['role-1'] });
  });

  test('creates and updates menus with deduplicated roles in one transaction', async () => {
    const state = fixture();
    const created = await state.service.create('app-1', input);
    expect(created.id).toBeString();
    expect(state.inserts[0]).toMatchObject({ tenant_id: 'tenant-1', application_id: 'app-1' });
    expect(state.batches[0]).toHaveLength(1);

    await state.service.update('app-1', 'menu-1', { ...input, name: '任务中心' });
    expect(state.updates[0]).toMatchObject({ name: '任务中心' });
    expect(state.deleted()).toBe(1);
  });

  test('rejects self-parenting and deletion while children exist', async () => {
    const state = fixture(1);
    await expect(
      state.service.update('app-1', 'menu-1', { ...input, parentId: 'menu-1' }),
    ).rejects.toThrow('不能以自己为父级');
    await expect(state.service.delete('app-1', 'menu-1')).rejects.toThrow('存在子菜单');
  });

  test('deletes role links and a leaf menu atomically', async () => {
    const state = fixture();
    await state.service.delete('app-1', 'menu-1');
    expect(state.deleted()).toBe(2);
  });
});
