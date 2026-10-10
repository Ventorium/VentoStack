/**
 * 022_prune_ai_context_and_audit_menus
 *
 * 清理 AI 菜单下的「审计日志 / 审批中心 / 上下文洞察」以及全局采集开关配置。
 *
 * 为什么 021 之后还要再做一次：
 * 迁移在种子之前执行（app.ts:98 runMigrations → :101 runSeeds），
 * 而 011_ai_context 这个种子当时仍在注册列表里，会在 021 删完之后把
 * `/app/ai/context` 菜单与 `ai_context_enabled` 配置重新写回来，
 * 导致 021 的清理被「播种」覆盖。种子删除后已无来源，但 021 早已被记入
 * __migrations 不会重跑，所以此处补一次幂等清理。
 *
 * 删除顺序：先按钮行（type=3 / permission）再父级菜单（type=2），
 * 因为 sys_menu.parent_id 是 ON DELETE RESTRICT，子行不先删会直接报错。
 * sys_role_menu.menu_id 是 ON DELETE CASCADE，授权关系会自动清理。
 */
import type { Migration } from '@ventostack/database';

const MENU_PERMISSIONS = [
  'ai:trace:list',
  'ai:trace:config',
  'ai:audit:list',
  'ai:approval:list',
  'ai:context:list',
  'ai:context:config',
] as const;

const MENU_PATHS = ['/app/ai/trace', '/app/ai/audit', '/app/ai/approvals', '/app/ai/context'] as const;

export const pruneAiContextAndAuditMenus: Migration = {
  name: '022_prune_ai_context_and_audit_menus',

  async up(executor) {
    // 先删按钮行：父菜单上挂着 permission，受 RESTRICT 约束必须从子行开始
    await executor(
      `DELETE FROM sys_menu
        WHERE permission IN ('ai:trace:list', 'ai:trace:config', 'ai:audit:list',
                            'ai:approval:list', 'ai:context:list', 'ai:context:config')`,
    );
    // 再删独立菜单页
    await executor(
      `DELETE FROM sys_menu
        WHERE path IN ('/app/ai/trace', '/app/ai/audit', '/app/ai/approvals', '/app/ai/context')`,
    );
    // 全局采集开关已改为按 Agent（ai_agent.context_collection_enabled），该配置键作废
    await executor("DELETE FROM sys_config WHERE key = 'ai_context_enabled'");
  },

  async down(executor) {
    // 菜单属于初始化数据（种子负责重建），此处不还原，避免回滚时与种子重复插入
    void executor;
  },
};

// 导出常量供测试断言，避免测试里手抄一份字符串后与实现漂移
export const PRUNE_MENU_PERMISSIONS = MENU_PERMISSIONS;
export const PRUNE_MENU_PATHS = MENU_PATHS;
