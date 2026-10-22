import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

/**
 * 虚拟机宿主管理按钮权限（平台管理员）
 *
 * 幂等：按 permission 判重；能力页菜单由 007_ai_menus 创建。
 */
export const addAiRuntimePermissionsSeed: Seed = {
  name: '014_ai_runtime_permissions',

  async run(executor) {
    const tenantId = env.TENANT_ID;
    const menuRows = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai/capabilities' AND type = 2`,
      [tenantId],
    );
    const menuId = (menuRows as unknown as Array<{ id: string }>)[0]?.id;
    if (!menuId) return;

    const adminRows = await executor(
      `SELECT id FROM sys_role WHERE tenant_id = $1 AND code = 'admin'`,
      [tenantId],
    );
    const adminRoleId = (adminRows as unknown as Array<{ id: string }>)[0]?.id;

    const buttons = [
      ['虚拟机宿主查看', 'ai:runtime-host:list', 10],
      ['虚拟机宿主新增', 'ai:runtime-host:create', 11],
      ['虚拟机宿主修改', 'ai:runtime-host:update', 12],
      ['虚拟机宿主删除', 'ai:runtime-host:delete', 13],
      ['虚拟机宿主检测', 'ai:runtime-host:verify', 14],
    ] as const;

    for (const [name, permission, sort] of buttons) {
      const existing = await executor(
        `SELECT id FROM sys_menu WHERE tenant_id = $1 AND permission = $2 LIMIT 1`,
        [tenantId, permission],
      );
      if ((existing as unknown[]).length > 0) continue;
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 3, $5, NULL, $6, TRUE, 1, NOW(), NOW())`,
        [id, tenantId, menuId, name, permission, sort],
      );
      if (adminRoleId) {
        await executor(
          'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [adminRoleId, id, tenantId],
        );
      }
    }
  },
};
