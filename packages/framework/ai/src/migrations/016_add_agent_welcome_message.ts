import type { Migration } from '@ventostack/database';

export const addAgentWelcomeMessage: Migration = {
  name: '016_add_agent_welcome_message',
  async up(executor): Promise<void> {
    await executor(`ALTER TABLE ai_agent ADD COLUMN IF NOT EXISTS welcome_message VARCHAR(500)`);
  },
  async down(executor): Promise<void> {
    await executor(`ALTER TABLE ai_agent DROP COLUMN IF EXISTS welcome_message`);
  },
};
