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

    // 按钮级权限（type=3）：与 workflow 路由 perm 调用一一对应
    const buttonPermissions: Array<{
      menuId: string;
      buttons: Array<{ name: string; permission: string; sort: number }>;
    }> = [
      {
        menuId: defMenuId,
        buttons: [
          { name: "流程新增", permission: "workflow:definition:create", sort: 1 },
          { name: "流程详情", permission: "workflow:definition:query", sort: 2 },
          { name: "流程修改", permission: "workflow:definition:update", sort: 3 },
          { name: "流程删除", permission: "workflow:definition:delete", sort: 4 },
          { name: "发布流程", permission: "workflow:definition:publish", sort: 5 },
          { name: "停用流程", permission: "workflow:definition:disable", sort: 6 },
          { name: "克隆流程", permission: "workflow:definition:create", sort: 7 },
        ],
      },
      {
        menuId: instanceMenuId,
        buttons: [
          { name: "发起申请", permission: "workflow:instance:create", sort: 1 },
          { name: "申请详情", permission: "workflow:instance:query", sort: 2 },
          { name: "撤回申请", permission: "workflow:instance:update", sort: 3 },
        ],
      },
      {
        menuId: taskMenuId,
        buttons: [
          { name: "审批通过", permission: "workflow:task:approve", sort: 1 },
          { name: "审批驳回", permission: "workflow:task:reject", sort: 2 },
          { name: "转办", permission: "workflow:task:transfer", sort: 3 },
          { name: "加签", permission: "workflow:task:add-sign", sort: 4 },
          { name: "催办", permission: "workflow:task:urge", sort: 5 },
        ],
      },
    ];

    for (const { menuId, buttons } of buttonPermissions) {
      for (const btn of buttons) {
        await executor(
          `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
           VALUES ($1, $2, $3, NULL, NULL, NULL, 3, $4, NULL, $5, TRUE, 1, NOW(), NOW())`,
          [generateUUID(), menuId, btn.name, btn.permission, btn.sort],
        );
      }
    }

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
      // 绑定按钮权限到 admin 角色
      const allChildMenuIds = await executor(
        `SELECT id FROM sys_menu WHERE parent_id IN ($1, $2, $3)`,
        [defMenuId, instanceMenuId, taskMenuId],
      );
      for (const row of allChildMenuIds as unknown as Array<{ id: string }>) {
        await executor('INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2)', [
          adminRoleId,
          row.id,
        ]);
      }
    }
  },
};
