import type { Migration } from '@ventostack/database';

/** 修正既有 AI 链路追踪开关的展示类型；配置值和租户归属保持不变。 */
export const normalizePresetConfigs: Migration = {
  name: '019_normalize_preset_configs',
  async up(executor) {
    await executor("UPDATE sys_config SET type = 2 WHERE key = 'ai_trace_enabled' AND type <> 2");
  },
  async down(executor) {
    await executor("UPDATE sys_config SET type = 1 WHERE key = 'ai_trace_enabled' AND type = 2");
  },
};
