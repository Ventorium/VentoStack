/**
 * AI 模块菜单种子数据
 * 幂等：如果已存在 path='/app/ai' 的菜单则跳过。
 */
import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

export const seedAiMenus: Seed = {
  name: "003_ai_menus",

  async run(executor) {
    // 检查是否已存在
    const existing = await executor(
      "SELECT id FROM sys_menu WHERE path = '/app/ai' AND type = 1",
    );
    if ((existing as unknown[]).length > 0) return;

    const dirId = generateUUID();
    const kbMenuId = generateUUID();
    const agentMenuId = generateUUID();
    const chatMenuId = generateUUID();
    const auditMenuId = generateUUID();
    const settingsMenuId = generateUUID();

    // AI 智能一级菜单（目录）
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, NULL, $7, $8, TRUE, 1, NOW(), NOW())`,
      [dirId, "AI 智能", "/app/ai", "LAYOUT", "/app/ai/chat", 1, "RobotOutlined", 4],
    );

    // AI 对话
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [chatMenuId, dirId, "AI 对话", "/app/ai/chat", "app/ai/chat/index", 2, "ai:chat:use", "MessageOutlined", 1],
    );

    // 知识库管理
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [kbMenuId, dirId, "知识库管理", "/app/ai/knowledge-bases", "app/ai/knowledge-bases/index", 2, "ai:knowledge-base:list", "DatabaseOutlined", 2],
    );

    // Agent 管理
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [agentMenuId, dirId, "Agent 管理", "/app/ai/agents", "app/ai/agents/index", 2, "ai:agent:list", "RobotOutlined", 3],
    );

    // 审计日志
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [auditMenuId, dirId, "审计日志", "/app/ai/audit", "app/ai/audit/index", 2, "ai:audit:view", "FileSearchOutlined", 4],
    );

    // AI 配置
    await executor(
      `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, TRUE, 1, NOW(), NOW())`,
      [settingsMenuId, dirId, "AI 配置", "/app/ai/settings", "app/ai/settings/index", 2, "ai:agent:update", "SettingOutlined", 5],
    );

    // 绑定到 admin 角色
    const adminRole = await executor(
      `SELECT id FROM sys_role WHERE code = 'admin'`,
    );
    const adminRoles = adminRole as unknown as Array<{ id: string }>;
    if (adminRoles.length > 0) {
      const adminRoleId = adminRoles[0]!.id;
      for (const menuId of [
        dirId,
        chatMenuId,
        kbMenuId,
        agentMenuId,
        auditMenuId,
        settingsMenuId,
      ]) {
        await executor(
          `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2)`,
          [adminRoleId, menuId],
        );
      }
    }
  },
};
