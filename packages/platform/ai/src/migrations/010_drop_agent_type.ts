import type { Migration } from "@ventostack/database";

export const dropAgentType: Migration = {
  name: "010_drop_agent_type",
  up: async (executor) => {
    await executor(`ALTER TABLE ai_agent DROP COLUMN IF EXISTS type`);
  },
  down: async (executor) => {
    await executor(`ALTER TABLE ai_agent ADD COLUMN IF NOT EXISTS type VARCHAR(32) NOT NULL DEFAULT 'chatbot'`);
  },
};
