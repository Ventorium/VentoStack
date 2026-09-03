import type { Migration } from '@ventostack/database';

export const addAgentRuntime: Migration = {
  name: '013_add_agent_runtime',
  up: async (executor) => {
    await executor(`
      ALTER TABLE ai_agent
      ADD COLUMN IF NOT EXISTS requires_virtual_environment BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS sandbox_id VARCHAR(128) NULL
    `);
    await executor(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_sandbox_id ON ai_agent(sandbox_id) WHERE sandbox_id IS NOT NULL`);
  },
  down: async (executor) => {
    await executor(`DROP INDEX IF EXISTS idx_ai_agent_sandbox_id`);
    await executor(`ALTER TABLE ai_agent DROP COLUMN IF EXISTS sandbox_id, DROP COLUMN IF EXISTS requires_virtual_environment`);
  },
};
