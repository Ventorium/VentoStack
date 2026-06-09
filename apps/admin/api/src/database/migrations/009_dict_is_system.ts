import type { Migration } from "@ventostack/database";

export const addDictIsSystem: Migration = {
  name: "009_dict_is_system",

  async up(executor) {
    // Add is_system column to sys_dict_type
    await executor(`
      ALTER TABLE sys_dict_type
      ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Add is_system column to sys_dict_data
    await executor(`
      ALTER TABLE sys_dict_data
      ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Mark all existing seed dict types as system (codes starting with sys_)
    await executor(`
      UPDATE sys_dict_type SET is_system = TRUE WHERE code LIKE 'sys\\_%'
    `);

    // Mark dict data belonging to system types as system as well
    await executor(`
      UPDATE sys_dict_data d
      SET is_system = TRUE
      FROM sys_dict_type t
      WHERE d.type_code = t.code AND t.is_system = TRUE
    `);
  },

  async down(executor) {
    await executor(`ALTER TABLE sys_dict_data DROP COLUMN IF EXISTS is_system`);
    await executor(`ALTER TABLE sys_dict_type DROP COLUMN IF EXISTS is_system`);
  },
};
