/**
 * AI 模块菜单 + 权限种子数据
 */
import type { Database } from "@ventostack/database";

export async function seedAIMenus(db: Database): Promise<void> {
  // AI 管理菜单
  const aiMenuId = crypto.randomUUID();
  await db.raw(
    `INSERT INTO sys_menu (id, name, path, icon, sort, parent_id, permission, type, status)
     VALUES ($1, 'AI 管理', '/ai', 'robot', 90, NULL, NULL, 'directory', 'active')
     ON CONFLICT DO NOTHING`,
    [aiMenuId],
  );

  // 知识库管理
  const kbMenuId = crypto.randomUUID();
  await db.raw(
    `INSERT INTO sys_menu (id, name, path, icon, sort, parent_id, permission, type, status)
     VALUES ($1, '知识库管理', '/ai/knowledge-bases', 'book', 1, $2, 'ai:knowledge-base:list', 'menu', 'active')
     ON CONFLICT DO NOTHING`,
    [kbMenuId, aiMenuId],
  );

  // Agent 管理
  const agentMenuId = crypto.randomUUID();
  await db.raw(
    `INSERT INTO sys_menu (id, name, path, icon, sort, parent_id, permission, type, status)
     VALUES ($1, 'Agent 管理', '/ai/agents', 'apartment', 2, $2, 'ai:agent:list', 'menu', 'active')
     ON CONFLICT DO NOTHING`,
    [agentMenuId, aiMenuId],
  );

  // 对话管理
  const chatMenuId = crypto.randomUUID();
  await db.raw(
    `INSERT INTO sys_menu (id, name, path, icon, sort, parent_id, permission, type, status)
     VALUES ($1, 'AI 对话', '/ai/chat', 'comment', 3, $2, 'ai:chat:use', 'menu', 'active')
     ON CONFLICT DO NOTHING`,
    [chatMenuId, aiMenuId],
  );

  // 审批管理
  const approvalMenuId = crypto.randomUUID();
  await db.raw(
    `INSERT INTO sys_menu (id, name, path, icon, sort, parent_id, permission, type, status)
     VALUES ($1, '审批管理', '/ai/approvals', 'check-circle', 4, $2, 'ai:approval:list', 'menu', 'active')
     ON CONFLICT DO NOTHING`,
    [approvalMenuId, aiMenuId],
  );
}
