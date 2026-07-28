import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';

/**
 * 添加审批流程菜单组。
 * 幂等：如果已存在 path='/workflow' 的菜单则跳过。
 *
 * 菜单结构：
 *   审批流程（目录 /workflow）
 *   ├── 流程定义（菜单 /workflow/definitions）
 *   ├── 我的申请（菜单 /workflow/instances）
 *   └── 我的审批（菜单 /workflow/tasks）
 */
export const addWorkflowMenuSeed: Seed = {
  name: '005_add_workflow_menu',

  async run(executor) {
    const existing = await executor(
      `SELECT id FROM sys_menu WHERE path = '/workflow' AND type = 1`,
    );
    if ((existing as unknown[]).length > 0) return;

    const dirId = generateUUID();
    const defMenuId = generateUUID();
    const instanceMenuId = generateUUID();
    const taskMenuId = generateUUID();

    // 目录
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, $7, $8, TRUE, 1, NOW(), NOW())`,
      [dirId, '审批流程', '/workflow', 'LAYOUT', '/workflow/definitions', 1, 'AuditOutlined', 3],
    );

    // 流程定义
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [
        defMenuId,
        dirId,
        '流程定义',
        '/workflow/definitions',
        'workflow/definitions/index',
        2,
        'workflow:definition:list',
        'NodeIndexOutlined',
        1,
      ],
    );

    // 我的申请
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [
        instanceMenuId,
        dirId,
        '我的申请',
        '/workflow/instances',
        'workflow/instances/index',
        2,
        'workflow:instance:list',
        'FileTextOutlined',
        2,
      ],
    );

    // 我的审批
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [
        taskMenuId,
        dirId,
        '我的审批',
        '/workflow/tasks',
        'workflow/tasks/index',
        2,
        'workflow:task:list',
        'CheckSquareOutlined',
        3,
      ],
    );

    // 绑定到 admin 角色
    const adminRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
    const [admin] = adminRole as unknown as Array<{ id: string }>;
    if (admin) {
      const adminRoleId = admin.id;
      for (const menuId of [dirId, defMenuId, instanceMenuId, taskMenuId]) {
        await executor('INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2)', [
          adminRoleId,
          menuId,
        ]);
      }
    }
  },
};
