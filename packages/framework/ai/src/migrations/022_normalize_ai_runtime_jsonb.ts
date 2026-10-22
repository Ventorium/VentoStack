import type { Migration } from '@ventostack/database';

/**
 * 修正 JSONB 参数早期被二次编码的问题：
 * - ai_session_runtime.bound_kb_ids 曾被写成 jsonb string（"[]"）而非 array（[]）
 * - ai_runtime_host.usage_json 曾被写成 jsonb string 而非 object
 *
 * 幂等：只处理 jsonb_typeof = 'string' 的行。
 */
export const normalizeAiRuntimeJsonb: Migration = {
  name: '022_normalize_ai_runtime_jsonb',
  up: async (executor) => {
    await executor(`
      UPDATE ai_session_runtime
      SET bound_kb_ids = (bound_kb_ids #>> '{}')::jsonb
      WHERE jsonb_typeof(bound_kb_ids) = 'string'
    `);
    await executor(`
      UPDATE ai_runtime_host
      SET usage_json = (usage_json #>> '{}')::jsonb
      WHERE jsonb_typeof(usage_json) = 'string'
    `);
  },
  down: async () => {
    // 数据修正无需回滚
  },
};
