import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

/**
 * AI 智能菜单 + 权限种子数据
 * 顶级目录：AI 智能（/app/ai）
 * 子菜单：知识库管理、Agent 管理、AI 对话、智能能力、AI 配置、审计日志
 * 幂等：如果已存在 path='/app/ai' 的目录菜单则跳过。
 */
export const addAIMenusSeed: Seed = {
  name: "007_ai_menus",

  async run(executor) {
    // 幂等检查：AI 智能目录已存在则跳过
    const existing = await executor(`SELECT id FROM sys_menu WHERE path = '/app/ai' AND type = 1`);
    if ((existing as unknown[]).length > 0) {
      return;
    }

    // 查询 admin 角色 ID（用于权限绑定）
    const adminRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
    const adminRoleId = (adminRole as unknown as Array<{ id: string }>)?.[0]?.id;

    async function insertMenu(
      name: string,
      path: string,
      icon: string,
      sort: number,
      parentId: string | null,
      permission: string | null,
      type: number, // 1=目录, 2=菜单
    ): Promise<string> {
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, NULL, $5, $6, $7, $8, TRUE, 1, NOW(), NOW())`,
        [id, parentId, name, path, type, permission, icon, sort],
      );
      if (adminRoleId) {
        await executor(
          `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [adminRoleId, id],
        );
      }
      return id;
    }

    // 插入按钮级权限（type=3），与 framework/ai 路由 perm 调用一一对应
    async function insertButton(
      parentId: string,
      name: string,
      permission: string,
      sort: number,
    ): Promise<void> {
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, NULL, NULL, 3, $4, NULL, $5, TRUE, 1, NOW(), NOW())`,
        [id, parentId, name, permission, sort],
      );
      if (adminRoleId) {
        await executor(
          `INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [adminRoleId, id],
        );
      }
    }

    // ── 顶级目录：AI 智能 ──
    const aiDirId = await insertMenu("AI 智能", "/app/ai", "RobotOutlined", 4, null, null, 1);

    // ── 子菜单 ──
    const kbMenuId = await insertMenu("知识库管理", "/app/ai/knowledge-bases", "BookOutlined", 1, aiDirId, "ai:knowledge-base:list", 2);
    const agentMenuId = await insertMenu("Agent 管理", "/app/ai/agents", "ApartmentOutlined", 2, aiDirId, "ai:agent:list", 2);
    await insertMenu("AI 对话", "/app/ai/chat", "CommentOutlined", 3, aiDirId, "ai:chat:use", 2);
    const skillMenuId = await insertMenu("智能能力", "/app/ai/capabilities", "ThunderboltOutlined", 4, aiDirId, "ai:skill:list", 2);
    const providerMenuId = await insertMenu("AI 配置", "/app/ai/settings", "SettingOutlined", 5, aiDirId, "ai:provider:list", 2);
    await insertMenu("审计日志", "/app/ai/audit", "AuditOutlined", 6, aiDirId, "ai:audit:list", 2);

    // 知识库按钮权限
    await insertButton(kbMenuId, "知识库新增", "ai:knowledge-base:create", 1);
    await insertButton(kbMenuId, "知识库修改", "ai:knowledge-base:update", 2);
    await insertButton(kbMenuId, "知识库删除", "ai:knowledge-base:delete", 3);

    // Agent 按钮权限（Agent 列表/详情/新增/修改/删除）
    await insertButton(agentMenuId, "Agent 新增", "ai:agent:create", 1);
    await insertButton(agentMenuId, "Agent 修改", "ai:agent:update", 2);
    await insertButton(agentMenuId, "Agent 删除", "ai:agent:delete", 3);

    // 智能能力按钮权限
    await insertButton(skillMenuId, "能力新增", "ai:skill:create", 1);
    await insertButton(skillMenuId, "能力修改", "ai:skill:update", 2);
    await insertButton(skillMenuId, "能力删除", "ai:skill:delete", 3);

    // AI 配置按钮权限
    await insertButton(providerMenuId, "Provider 新增", "ai:provider:create", 1);
    await insertButton(providerMenuId, "Provider 修改", "ai:provider:update", 2);
    await insertButton(providerMenuId, "Provider 删除", "ai:provider:delete", 3);
  },
};
