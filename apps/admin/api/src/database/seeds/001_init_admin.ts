import type { Seed } from '@ventostack/database';
import { createPasswordHasher } from '@ventostack/auth';
import { generateUUID } from '@ventostack/core';

/**
 * Initial admin seed: creates the admin user, admin role,
 * and a basic menu tree for system management.
 */
export const initAdminSeed: Seed = {
  name: '001_init_admin',

  async run(executor) {
    // 幂等检查：admin 角色已存在则跳过
    const existingRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
    if ((existingRole as unknown[]).length > 0) {
      return;
    }

    const adminUserId = generateUUID();
    const adminRoleId = generateUUID();

    // Hash the admin password using @ventostack/auth
    const passwordHasher = createPasswordHasher();
    const passwordHash = await passwordHasher.hash('admin123');

    // Insert admin role
    await executor(
      `INSERT INTO sys_role (id, name, code, sort, data_scope, status, remark, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [adminRoleId, '超级管理员', 'admin', 1, 1, 1, '系统内置超级管理员角色'],
    );

    // Insert admin user
    await executor(
      `INSERT INTO sys_user (id, username, password_hash, nickname, gender, status, mfa_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [adminUserId, 'admin', passwordHash, '超级管理员', 0, 1, false],
    );

    // Bind admin user to admin role
    await executor(
      `INSERT INTO sys_user_role (user_id, role_id) VALUES ($1, $2)`,
      [adminUserId, adminRoleId],
    );

    // --- Menu tree for system management ---

    // Level 1: Directories
    const systemDirId = generateUUID();
    const monitorDirId = generateUUID();

    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, $7, $8, TRUE, 1, NOW(), NOW())`,
      [systemDirId, '系统管理', '/system', 'LAYOUT', '/system/users', 1, 'SettingOutlined', 1],
    );

    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, $7, $8, TRUE, 1, NOW(), NOW())`,
      [monitorDirId, '系统监控', '/monitor', 'LAYOUT', '/system/online', 2, 'DashboardOutlined', 2],
    );

    // Level 2: Menus
    const menuEntries: Array<{
      id: string;
      name: string;
      path: string;
      component: string;
      icon: string;
      sort: number;
    }> = [
      { id: generateUUID(), name: '用户管理', path: '/system/users', component: 'system/users/index', icon: 'UserOutlined', sort: 1 },
      { id: generateUUID(), name: '角色管理', path: '/system/roles', component: 'system/roles/index', icon: 'TeamOutlined', sort: 2 },
      { id: generateUUID(), name: '菜单管理', path: '/system/menus', component: 'system/menus/index', icon: 'MenuOutlined', sort: 3 },
      { id: generateUUID(), name: '部门管理', path: '/system/depts', component: 'system/depts/index', icon: 'ApartmentOutlined', sort: 4 },
      { id: generateUUID(), name: '岗位管理', path: '/system/posts', component: 'system/posts/index', icon: 'SolutionOutlined', sort: 5 },
      { id: generateUUID(), name: '字典管理', path: '/system/dict', component: 'system/dict/index', icon: 'BookOutlined', sort: 6 },
      { id: generateUUID(), name: '参数设置', path: '/system/configs', component: 'system/configs/index', icon: 'ToolOutlined', sort: 7 },
      { id: generateUUID(), name: '通知公告', path: '/system/notices', component: 'system/notices/index', icon: 'BellOutlined', sort: 8 },
      { id: generateUUID(), name: '日志管理', path: '/system/logs', component: 'LAYOUT', icon: 'FileTextOutlined', sort: 9 },
    ];

    // Level 2: Monitor menus (under monitorDirId)
    const monitorMenuEntries: Array<{
      id: string;
      name: string;
      path: string;
      component: string;
      icon: string;
      sort: number;
    }> = [
      { id: generateUUID(), name: '在线用户', path: '/system/online', component: 'system/online/index', icon: 'TeamOutlined', sort: 1 },
      { id: generateUUID(), name: '定时任务', path: '/system/scheduler', component: 'system/scheduler/index', icon: 'ClockCircleOutlined', sort: 2 },
      { id: generateUUID(), name: '文件管理', path: '/system/oss', component: 'system/oss/index', icon: 'FolderOutlined', sort: 3 },
      { id: generateUUID(), name: '系统监控', path: '/system/monitor', component: 'system/monitor/index', icon: 'DashboardOutlined', sort: 4 },
      { id: generateUUID(), name: '代码生成', path: '/system/gen', component: 'system/gen/index', icon: 'CodeOutlined', sort: 5 },
      { id: generateUUID(), name: '消息中心', path: '/system/notification', component: 'system/notification/index', icon: 'BellOutlined', sort: 6 },
    ];

    // Level 3: Buttons (permissions) per menu
    const buttonPermissions: Record<string, Array<{ name: string; permission: string; sort: number }>> = {
      '用户管理': [
        { name: '用户查询', permission: 'system:user:list', sort: 1 },
        { name: '用户新增', permission: 'system:user:add', sort: 2 },
        { name: '用户修改', permission: 'system:user:edit', sort: 3 },
        { name: '用户删除', permission: 'system:user:remove', sort: 4 },
        { name: '重置密码', permission: 'system:user:resetPwd', sort: 5 },
        { name: '导出用户', permission: 'system:user:export', sort: 6 },
      ],
      '角色管理': [
        { name: '角色查询', permission: 'system:role:list', sort: 1 },
        { name: '角色新增', permission: 'system:role:add', sort: 2 },
        { name: '角色修改', permission: 'system:role:edit', sort: 3 },
        { name: '角色删除', permission: 'system:role:remove', sort: 4 },
        { name: '导出角色', permission: 'system:role:export', sort: 5 },
      ],
      '菜单管理': [
        { name: '菜单查询', permission: 'system:menu:list', sort: 1 },
        { name: '菜单新增', permission: 'system:menu:add', sort: 2 },
        { name: '菜单修改', permission: 'system:menu:edit', sort: 3 },
        { name: '菜单删除', permission: 'system:menu:remove', sort: 4 },
      ],
      '部门管理': [
        { name: '部门查询', permission: 'system:dept:list', sort: 1 },
        { name: '部门新增', permission: 'system:dept:add', sort: 2 },
        { name: '部门修改', permission: 'system:dept:edit', sort: 3 },
        { name: '部门删除', permission: 'system:dept:remove', sort: 4 },
      ],
      '岗位管理': [
        { name: '岗位查询', permission: 'system:post:list', sort: 1 },
        { name: '岗位新增', permission: 'system:post:add', sort: 2 },
        { name: '岗位修改', permission: 'system:post:edit', sort: 3 },
        { name: '岗位删除', permission: 'system:post:remove', sort: 4 },
        { name: '导出岗位', permission: 'system:post:export', sort: 5 },
      ],
      '字典管理': [
        { name: '字典查询', permission: 'system:dict:list', sort: 1 },
        { name: '字典新增', permission: 'system:dict:add', sort: 2 },
        { name: '字典修改', permission: 'system:dict:edit', sort: 3 },
        { name: '字典删除', permission: 'system:dict:remove', sort: 4 },
        { name: '导出字典', permission: 'system:dict:export', sort: 5 },
      ],
      '参数设置': [
        { name: '参数查询', permission: 'system:config:list', sort: 1 },
        { name: '参数新增', permission: 'system:config:add', sort: 2 },
        { name: '参数修改', permission: 'system:config:edit', sort: 3 },
        { name: '参数删除', permission: 'system:config:remove', sort: 4 },
        { name: '导出参数', permission: 'system:config:export', sort: 5 },
      ],
      '通知公告': [
        { name: '公告查询', permission: 'system:notice:list', sort: 1 },
        { name: '公告新增', permission: 'system:notice:add', sort: 2 },
        { name: '公告修改', permission: 'system:notice:edit', sort: 3 },
        { name: '公告删除', permission: 'system:notice:remove', sort: 4 },
      ],
      '日志管理': [],
      '在线用户': [
        { name: '在线查询', permission: 'system:online:list', sort: 1 },
        { name: '强退用户', permission: 'system:online:forceLogout', sort: 2 },
      ],
      '定时任务': [
        { name: '任务查询', permission: 'system:scheduler:list', sort: 1 },
        { name: '任务新增', permission: 'system:scheduler:add', sort: 2 },
        { name: '任务修改', permission: 'system:scheduler:edit', sort: 3 },
        { name: '任务删除', permission: 'system:scheduler:remove', sort: 4 },
        { name: '启停任务', permission: 'system:scheduler:toggle', sort: 5 },
        { name: '立即执行', permission: 'system:scheduler:execute', sort: 6 },
      ],
      '文件管理': [
        { name: '文件查询', permission: 'system:oss:list', sort: 1 },
        { name: '文件上传', permission: 'system:oss:upload', sort: 2 },
        { name: '文件删除', permission: 'system:oss:remove', sort: 3 },
      ],
      '系统监控': [
        { name: '监控查询', permission: 'system:monitor:list', sort: 1 },
      ],
      '代码生成': [
        { name: '生成查询', permission: 'system:gen:list', sort: 1 },
        { name: '生成代码', permission: 'system:gen:generate', sort: 2 },
        { name: '生成删除', permission: 'system:gen:remove', sort: 3 },
      ],
      '消息中心': [
        { name: '消息查询', permission: 'system:notification:list', sort: 1 },
        { name: '消息发送', permission: 'system:notification:send', sort: 2 },
        { name: '消息删除', permission: 'system:notification:remove', sort: 3 },
      ],
    };

    // Insert Level 2 menus and collect their IDs for role binding
    const allMenuIds: string[] = [systemDirId, monitorDirId];

    for (const menu of menuEntries) {
      await executor(
        `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, 2, NULL, $6, $7, TRUE, 1, NOW(), NOW())`,
        [menu.id, systemDirId, menu.name, menu.path, menu.component, menu.icon, menu.sort],
      );
      allMenuIds.push(menu.id);

      // Insert Level 3 button permissions for this menu
      const buttons = buttonPermissions[menu.name];
      if (buttons) {
        for (const btn of buttons) {
          const btnId = generateUUID();
          await executor(
            `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
             VALUES ($1, $2, $3, NULL, NULL, NULL, 3, $4, NULL, $5, TRUE, 1, NOW(), NOW())`,
            [btnId, menu.id, btn.name, btn.permission, btn.sort],
          );
          allMenuIds.push(btnId);
        }
      }
    }

    // Insert Level 2 monitor menus and their button permissions
    for (const menu of monitorMenuEntries) {
      await executor(
        `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, 2, NULL, $6, $7, TRUE, 1, NOW(), NOW())`,
        [menu.id, monitorDirId, menu.name, menu.path, menu.component, menu.icon, menu.sort],
      );
      allMenuIds.push(menu.id);

      const buttons = buttonPermissions[menu.name];
      if (buttons) {
        for (const btn of buttons) {
          const btnId = generateUUID();
          await executor(
            `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
             VALUES ($1, $2, $3, NULL, NULL, NULL, 3, $4, NULL, $5, TRUE, 1, NOW(), NOW())`,
            [btnId, menu.id, btn.name, btn.permission, btn.sort],
          );
          allMenuIds.push(btnId);
        }
      }
    }

    // Bind admin role to all menus
    for (const menuId of allMenuIds) {
      await executor(
        `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2)`,
        [adminRoleId, menuId],
      );
    }
  },
};
