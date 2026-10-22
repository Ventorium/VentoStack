import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

/**
 * 「对话渠道」菜单 + 权限种子
 *
 * 为什么单独一个种子而不是改 007_ai_menus：
 * 007 对已安装环境是「/app/ai 已存在就整体跳过」，改它对存量部署不生效。
 *
 * 幂等：按 path='/app/ai/channels' 判重，可重复执行。
 */
export const addAiChannelMenuSeed: Seed = {
  name: '013_ai_channel_menu',

  async run(executor) {
    const tenantId = env.TENANT_ID;

    const existing = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai/channels'`,
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

    const menuId = generateUUID();
    await executor(
      `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL, 2, $6, $7, $8, TRUE, 1, NOW(), NOW())`,
      [
        menuId,
        tenantId,
        parentId,
        '对话渠道',
        '/app/ai/channels',
        'ai:channel:use',
        'MessageOutlined',
        6,
      ],
    );
    if (adminRoleId) {
      await executor(
        'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [adminRoleId, menuId, tenantId],
      );
    }

    // 无独立按钮：渠道的增删改启停都在该页内，统一由 ai:channel:use 控制
  },
};
