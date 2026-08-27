import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

/**
 * AI 链路追踪菜单 + 配置开关种子数据
 * 幂等：
 * - 菜单：已存在 path='/app/ai/trace' 则跳过
 * - 配置：sys_config.ai_trace_enabled 已存在则跳过（默认 'true'，默认可审计）
 */
export const addAITraceSeed: Seed = {
  name: "011_ai_trace",

  async run(executor) {
    // ── 菜单：链路追踪（/app/ai/trace） ──
    const existing = await executor(
      `SELECT id FROM sys_menu WHERE path = '/app/ai/trace' AND type = 2`,
    );
    if ((existing as unknown[]).length === 0) {
      const aiDir = await executor(`SELECT id FROM sys_menu WHERE path = '/app/ai' AND type = 1`);
      const aiDirId = (aiDir as unknown as Array<{ id: string }>)?.[0]?.id;

      const adminRole = await executor(`SELECT id FROM sys_role WHERE code = 'admin'`);
      const adminRoleId = (adminRole as unknown as Array<{ id: string }>)?.[0]?.id;

      if (aiDirId) {
        const menuId = generateUUID();
        await executor(
          `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NULL, NULL, 2, $5, $6, 8, TRUE, 1, NOW(), NOW())`,
          [menuId, aiDirId, "链路追踪", "/app/ai/trace", "ai:trace:list", "NodeIndexOutlined"],
        );
        if (adminRoleId) {
          await executor(
            "INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [adminRoleId, menuId],
          );
        }

        // 按钮权限：追踪开关配置
        const buttonId = generateUUID();
        await executor(
          `INSERT INTO sys_menu (id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
           VALUES ($1, $2, $3, '', NULL, NULL, 3, $4, NULL, 1, TRUE, 1, NOW(), NOW())`,
          [buttonId, menuId, "追踪开关配置", "ai:trace:config"],
        );
        if (adminRoleId) {
          await executor(
            "INSERT INTO sys_role_menu (role_id, menu_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [adminRoleId, buttonId],
          );
        }
      }
    }

    // ── 配置：追踪开关（默认开启） ──
    const configExisting = await executor(
      `SELECT id FROM sys_config WHERE key = 'ai_trace_enabled'`,
    );
    if ((configExisting as unknown[]).length === 0) {
      await executor(
        `INSERT INTO sys_config (id, name, key, value, type, "group", sort, remark, created_at, updated_at)
         VALUES ($1, $2, $3, 'true', 1, 'ai', 0, $4, NOW(), NOW())
         ON CONFLICT (key) DO NOTHING`,
        [
          generateUUID(),
          "AI 链路追踪开关",
          "ai_trace_enabled",
          "是否记录 AI 请求的完整调用链路（会话 → 消息 → agent loop 步骤）",
        ],
      );
    }
  },
};
