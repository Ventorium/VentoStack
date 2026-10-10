import type { Migration } from '@ventostack/database';

/**
 * 两处调整：
 *  1. `ai_agent` 增加 `context_collection_enabled` —— 上下文采集改为按 Agent 独立开关，
 *     取代原先 sys_config 上的全局 `ai_context_enabled`（上下文内容属调试信息，默认关闭，
 *     必须显式为某个 Agent 开启后才落库）。
 *  2. 清理 AI 菜单下的三个失效入口：
 *       - `/app/ai/audit`（审计日志）—— 无前端页面、无后端列表路由，死链
 *       - `/app/ai/approvals`（审批中心）—— 同上；审批交互在对话内完成（/api/ai/chat/approvals/:id/confirm）
 *       - `/app/ai/context`（上下文洞察）—— 已下沉为对话内的「上下文」页签，不再是独立菜单
 *     这三个菜单没有任何 seed / 迁移会创建它们，是早期版本遗留的存量行。
 *
 * 删除顺序：`sys_menu.parent_id` 是 ON DELETE RESTRICT，按钮是菜单的子行，必须先删子行。
 */
export const addAgentContextToggleAndPruneAiMenus: Migration = {
  name: '021_agent_context_toggle_and_prune_ai_menus',
  async up(executor) {
    await executor(
      'ALTER TABLE ai_agent ADD COLUMN IF NOT EXISTS context_collection_enabled BOOLEAN NOT NULL DEFAULT FALSE',
    );

    // 按钮行（type=3）先于父菜单删除
    await executor(
      `DELETE FROM sys_menu
        WHERE permission IN ('ai:trace:list','ai:trace:config','ai:audit:list','ai:approval:list','ai:context:list','ai:context:config')
           OR path IN ('/app/ai/trace','/app/ai/audit','/app/ai/approvals','/app/ai/context')`,
    );

    // 全局采集开关已被按 Agent 开关取代
    await executor("DELETE FROM sys_config WHERE key = 'ai_context_enabled'");
  },

  async down(executor) {
    await executor('ALTER TABLE ai_agent DROP COLUMN IF EXISTS context_collection_enabled');

    // 菜单与配置由 007/011 种子在下次启动时重新创建，回滚只清理结构变更
    await executor("DELETE FROM sys_config WHERE key = 'ai_context_enabled'");
  },
};
