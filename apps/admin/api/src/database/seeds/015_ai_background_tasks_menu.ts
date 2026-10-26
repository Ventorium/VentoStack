import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

/**
 * 「后台任务」菜单 + 权限种子
 *
 * 后台任务是跨会话视图：Agent 在对话里布置的脚本任务/定时唤醒都汇总在这里查看与运维。
 * 幂等：按 path='/app/ai/tasks' 判重，可重复执行。
 */
export const addAiBackgroundTasksMenuSeed: Seed = {
  name: '015_ai_background_tasks_menu',

  async run(executor) {
    const tenantId = env.TENANT_ID;

    const existing = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai/tasks'`,
      [tenantId],
    );
    if ((existing as unknown[]).length > 0) {
      return;
    }

    // 父目录必须存在：AI 目录是 007 种子建的
    const parentRows = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai' AND type = 1`,
      [tenantId],
    );
    const parentId = (parentRows as unknown as Array<{ id: string }>)[0]?.id;
    if (!parentId) {
      // AI 模块未启用时该目录不存在，此时不建菜单（避免游离菜单）
      return;
    }

    const adminRoleRows = await executor(
      `SELECT id FROM sys_role WHERE tenant_id = $1 AND code = 'admin'`,
      [tenantId],
    );
    const adminRoleId = (adminRoleRows as unknown as Array<{ id: string }>)[0]?.id;

    async function insertMenu(params: {
      parentId: string | null;
      name: string;
      path: string | null;
      type: number;
      permission: string | null;
      icon: string | null;
      sort: number;
    }): Promise<string> {
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
        [
          id,
          tenantId,
          params.parentId,
          params.name,
          params.path,
          params.type,
          params.permission,
          params.icon,
          params.sort,
        ],
      );
      if (adminRoleId) {
        await executor(
          'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [adminRoleId, id, tenantId],
        );
      }
      return id;
    }

    const menuId = await insertMenu({
      parentId,
      name: '后台任务',
      path: '/app/ai/tasks',
      type: 2,
      permission: 'ai:background-task:list',
      icon: 'FieldTimeOutlined',
      sort: 7,
    });

    // 按钮级权限：与 framework/ai 后台任务路由的 perm 调用一一对应
    await insertMenu({
      parentId: menuId,
      name: '任务查询',
      path: null,
      type: 3,
      permission: 'ai:background-task:query',
      icon: null,
      sort: 1,
    });
    await insertMenu({
      parentId: menuId,
      name: '任务运维',
      path: null,
      type: 3,
      permission: 'ai:background-task:update',
      icon: null,
      sort: 2,
    });
    await insertMenu({
      parentId: menuId,
      name: '任务删除',
      path: null,
      type: 3,
      permission: 'ai:background-task:delete',
      icon: null,
      sort: 3,
    });
  },
};
