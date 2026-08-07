import type { Migration } from "@ventostack/database";

export const addProviderModelsDevSlug: Migration = {
  name: "009_add_provider_models_dev_slug",
  up: async (executor) => {
    await executor(`
      ALTER TABLE ai_provider
      ADD COLUMN IF NOT EXISTS models_dev_slug VARCHAR(128) DEFAULT NULL
    `);
  },
  down: async (executor) => {
    await executor(`
      ALTER TABLE ai_provider
      DROP COLUMN IF EXISTS models_dev_slug
    `);
  },
};
