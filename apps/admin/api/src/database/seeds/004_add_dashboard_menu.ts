import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

/**
 * 添加仪表盘菜单项，作为侧边栏第一个顶级入口。
 * 幂等：如果已存在 path='/app' 的菜单则跳过。
 */
export const addDashboardMenuSeed: Seed = {
  name: '004_add_dashboard_menu',

  async run(executor) {
    const tenantId = env.TENANT_ID;

    // 幂等检查：仪表盘菜单已存在则跳过
    const existing = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app' AND type = 2`,
      [tenantId],
    );
    if ((existing as unknown[]).length > 0) {
      return;
    }

    const dashboardMenuId = generateUUID();

    // 插入仪表盘菜单（顶级，无父级）
    await executor(
      `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $5, NULL, $6, NULL, $7, 0, TRUE, 1, NOW(), NOW())`,
      [dashboardMenuId, tenantId, '仪表盘', '/app', 'app/index', 2, 'HomeOutlined'],
    );

    // 查询 admin 角色 ID
    const adminRole = await executor(
      `SELECT id FROM sys_role WHERE tenant_id = $1 AND code = 'admin'`,
      [tenantId],
    );
    const [admin] = adminRole as unknown as Array<{ id: string }>;
    if (admin) {
      const adminRoleId = admin.id;
      // 绑定仪表盘菜单到 admin 角色
      await executor(
        'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3)',
        [adminRoleId, dashboardMenuId, tenantId],
      );
    }
  },
};
