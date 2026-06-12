/**
 * 给 ai_model 添加结构化输出和思考强度字段
 */
import type { Migration } from "@ventostack/database";

export const addModelCapabilities: Migration = {
  name: "006_add_model_capabilities",
  up: async (executor) => {
    await executor(`
      ALTER TABLE ai_model
      ADD COLUMN IF NOT EXISTS supports_structured_output BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS thinking_intensity VARCHAR(32) DEFAULT NULL
    `);
  },
  down: async (executor) => {
    await executor(`
      ALTER TABLE ai_model
      DROP COLUMN IF EXISTS supports_structured_output,
      DROP COLUMN IF EXISTS thinking_intensity
    `);
  },
};
