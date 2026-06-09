import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

/**
 * 添加仪表盘菜单项，作为侧边栏第一个顶级入口。
 * 幂等：如果已存在 path='/app' 的菜单则跳过。
 */
export const addDashboardMenuSeed: Seed = {
  name: "004_add_dashboard_menu",

  async run(executor) {
    // 幂等检查：仪表盘菜单已存在则跳过
    const existing = await executor(`SELECT id FROM sys_menu WHERE path = '/app' AND type = 2`);
    if ((existing as unknown[]).length > 0) {
      return;
    }

    const dashboardMenuId = generateUUID();

    // 插入仪表盘菜单（顶级，无父级）
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, NULL, $5, NULL, $6, $7, TRUE, 1, NOW(), NOW())`,
      [dashboardMenuId, "仪表盘", "/app", "app/index", 2, "HomeOutlined", 0],
    );

    // 查询 admin 角色 ID
    const adminRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
    if ((adminRole as unknown[]).length > 0) {
      const adminRoleId = (adminRole as unknown as Array<{ id: string }>)[0].id;
      // 绑定仪表盘菜单到 admin 角色
      await executor(`INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2)`, [
        adminRoleId,
        dashboardMenuId,
      ]);
    }
  },
};
