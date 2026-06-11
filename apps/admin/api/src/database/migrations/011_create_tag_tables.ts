import type { Migration } from "@ventostack/database";

export const createTagTables: Migration = {
  name: "011_create_tag_tables",
  up: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_tag (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        sort INT DEFAULT 0,
        status INT DEFAULT 1,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS sys_user_tag (
        user_id VARCHAR(36) NOT NULL,
        tag_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (user_id, tag_id)
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_user_tag_tag_id
      ON sys_user_tag(tag_id)
    `);

    // Seed default tags
    const defaultTags = [
      { id: crypto.randomUUID(), name: "CEO", code: "ceo", sort: 100 },
      { id: crypto.randomUUID(), name: "总经理", code: "general_manager", sort: 90 },
      { id: crypto.randomUUID(), name: "领导", code: "leader", sort: 80 },
      { id: crypto.randomUUID(), name: "主管", code: "supervisor", sort: 70 },
      { id: crypto.randomUUID(), name: "经理", code: "manager", sort: 60 },
      { id: crypto.randomUUID(), name: "总监", code: "director", sort: 50 },
      { id: crypto.randomUUID(), name: "HR", code: "hr", sort: 40 },
      { id: crypto.randomUUID(), name: "财务", code: "finance", sort: 30 },
    ];

    for (const tag of defaultTags) {
      await executor(
        `INSERT INTO sys_tag (id, name, code, sort, status) 
         SELECT $1, $2, $3, $4, 1
         WHERE NOT EXISTS (SELECT 1 FROM sys_tag WHERE code = $3)`,
        [tag.id, tag.name, tag.code, tag.sort],
      );
    }
  },
  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS sys_user_tag`);
    await executor(`DROP TABLE IF EXISTS sys_tag`);
  },
};
