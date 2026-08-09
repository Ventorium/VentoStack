import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';

/**
 * AI 工具审批中心菜单 + 权限种子数据
 * 独立于 007_ai_menus（007 在 /app/ai 已存在时跳过），本种子幂等补插：
 * 若已存在 path='/app/ai/approvals' 的菜单则跳过。
 */
export const addAIApprovalMenuSeed: Seed = {
  name: '009_ai_approval_menu',

  async run(executor) {
    const existing = await executor(
      `SELECT id FROM sys_menu WHERE path = '/app/ai/approvals' AND type = 2`,
    );
    if ((existing as unknown[]).length > 0) {
      return;
    }

    // 查找 AI 智能顶级目录
    const aiDir = await executor(`SELECT id FROM sys_menu WHERE path = '/app/ai' AND type = 1`);
    const aiDirId = (aiDir as unknown as Array<{ id: string }>)?.[0]?.id;
    if (!aiDirId) return;

    const adminRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
    const adminRoleId = (adminRole as unknown as Array<{ id: string }>)?.[0]?.id;

    const id = generateUUID();
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, NULL, 2, $5, $6, 7, TRUE, 1, NOW(), NOW())`,
      [id, aiDirId, '审批中心', '/app/ai/approvals', 'ai:approval:list', 'AuditOutlined'],
    );
    if (adminRoleId) {
      await executor(
        'INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [adminRoleId, id],
      );
    }
  },
};
