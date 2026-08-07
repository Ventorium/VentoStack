/**
 * 将 thinking_intensity 替换为 reasoning_options JSONB
 * （007 已添加 supports_structured_output 和 thinking_intensity）
 */
import type { Migration } from "@ventostack/database";

export const addReasoningOptions: Migration = {
  name: "008_add_reasoning_options",
  up: async (executor) => {
    // 添加 reasoning_options 列
    await executor(`
      ALTER TABLE ai_model
      ADD COLUMN IF NOT EXISTS reasoning_options JSONB DEFAULT NULL
    `);
    // 删除旧的 thinking_intensity 列
    await executor(`
      ALTER TABLE ai_model
      DROP COLUMN IF EXISTS thinking_intensity
    `);
  },
  down: async (executor) => {
    await executor(`
      ALTER TABLE ai_model
      ADD COLUMN IF NOT EXISTS thinking_intensity VARCHAR(32) DEFAULT NULL
    `);
    await executor(`
      ALTER TABLE ai_model
      DROP COLUMN IF EXISTS reasoning_options
    `);
  },
};
