import type { Migration } from '@ventostack/database';

/** Agent 级虚拟机联网开关；默认允许。 */
export const addAgentNetworkEnabled: Migration = {
  name: '023_add_agent_network_enabled',
  up: async (executor) => {
    await executor(
      `ALTER TABLE ai_agent ADD COLUMN IF NOT EXISTS network_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    );
    await executor(
      `ALTER TABLE ai_agent_runtime ADD COLUMN IF NOT EXISTS network_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
    );
  },
  down: async (executor) => {
    await executor(`ALTER TABLE ai_agent DROP COLUMN IF EXISTS network_enabled`);
    await executor(`ALTER TABLE ai_agent_runtime DROP COLUMN IF EXISTS network_enabled`);
  },
};
