import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

/**
 * AI 链路追踪菜单 + 配置开关种子数据
 * 幂等：
 * - 菜单：已存在 path='/app/ai/trace' 则跳过
 * - 配置：sys_config.ai_trace_enabled 已存在则跳过（默认 'true'，默认可审计）
 */
export const addAITraceSeed: Seed = {
  name: '011_ai_trace',

  async run(executor) {
    const tenantId = env.TENANT_ID;

    // ── 菜单：链路追踪（/app/ai/trace） ──
    const existing = await executor(
      `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai/trace' AND type = 2`,
      [tenantId],
    );
    if ((existing as unknown[]).length === 0) {
      const aiDir = await executor(
        `SELECT id FROM sys_menu WHERE tenant_id = $1 AND path = '/app/ai' AND type = 1`,
        [tenantId],
      );
      const aiDirId = (aiDir as unknown as Array<{ id: string }>)?.[0]?.id;

      const adminRole = await executor(
        `SELECT id FROM sys_role WHERE tenant_id = $1 AND code = 'admin'`,
        [tenantId],
      );
      const adminRoleId = (adminRole as unknown as Array<{ id: string }>)?.[0]?.id;

      if (aiDirId) {
        const menuId = generateUUID();
        await executor(
          `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NULL, NULL, 2, $6, $7, 6, TRUE, 1, NOW(), NOW())`,
          [
            menuId,
            tenantId,
            aiDirId,
            '链路追踪',
            '/app/ai/trace',
            'ai:trace:list',
            'NodeIndexOutlined',
          ],
        );
        if (adminRoleId) {
          await executor(
            'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [adminRoleId, menuId, tenantId],
          );
        }

        // 按钮权限：追踪开关配置
        const buttonId = generateUUID();
        await executor(
          `INSERT INTO sys_menu (id, tenant_id, parent_id, name, path, component, redirect, type, permission, icon, sort, visible, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, '', NULL, NULL, 3, $5, NULL, 1, TRUE, 1, NOW(), NOW())`,
          [buttonId, tenantId, menuId, '追踪开关配置', 'ai:trace:config'],
        );
        if (adminRoleId) {
          await executor(
            'INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [adminRoleId, buttonId, tenantId],
          );
        }
      }
    }

    // ── 配置：追踪开关（默认开启） ──
    const configExisting = await executor(
      `SELECT id FROM sys_config WHERE tenant_id = $1 AND key = 'ai_trace_enabled'`,
      [tenantId],
    );
    if ((configExisting as unknown[]).length === 0) {
      await executor(
        `INSERT INTO sys_config (id, tenant_id, name, key, value, type, "group", sort, remark, created_at, updated_at)
         VALUES ($1, $2, $3, 'ai_trace_enabled', 'true', 2, 'ai', 0, $4, NOW(), NOW())
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [
          generateUUID(),
          tenantId,
          'AI 链路追踪开关',
          '是否记录 AI 请求的完整调用链路（会话 → 消息 → agent loop 步骤）',
        ],
      );
    }
  },
};
