import type { Migration } from '@ventostack/database';

export const agentModelsArray: Migration = {
  name: '014_agent_models_array',
  up: async (executor) => {
    await executor(`
      ALTER TABLE ai_agent
      ALTER COLUMN model TYPE TEXT[]
      USING ARRAY[CASE WHEN model = '' THEN 'default' ELSE model END]::TEXT[]
    `);
    await executor(`ALTER TABLE ai_agent ALTER COLUMN model SET DEFAULT ARRAY['default']::TEXT[]`);
    await executor(`ALTER TABLE ai_agent ALTER COLUMN model SET NOT NULL`);
  },
  down: async (executor) => {
    // 回滚丢弃多余模型，仅保留第一项（回滚场景可接受）
    await executor(`
      ALTER TABLE ai_agent
      ALTER COLUMN model TYPE VARCHAR(64)
      USING (CASE WHEN model[1] IS NULL THEN 'default' ELSE model[1] END)
    `);
    await executor(`ALTER TABLE ai_agent ALTER COLUMN model DROP DEFAULT`);
  },
};
