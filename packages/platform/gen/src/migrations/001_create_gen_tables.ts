import type { Migration } from "@ventostack/database";

export const createGenTables: Migration = {
  name: "001_create_gen_tables",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_gen_table (
        id VARCHAR(36) PRIMARY KEY,
        table_name VARCHAR(128) NOT NULL,
        class_name VARCHAR(128) NOT NULL,
        module_name VARCHAR(64) NOT NULL,
        function_name VARCHAR(128) NOT NULL,
        function_author VARCHAR(64),
        remark VARCHAR(512),
        status SMALLINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS sys_gen_table_column (
        id VARCHAR(36) PRIMARY KEY,
        table_id VARCHAR(36) NOT NULL,
        column_name VARCHAR(128) NOT NULL,
        column_type VARCHAR(64) NOT NULL,
        typescript_type VARCHAR(64) NOT NULL,
        field_name VARCHAR(128) NOT NULL,
        field_comment VARCHAR(256),
        is_primary BOOLEAN DEFAULT FALSE,
        is_nullable BOOLEAN DEFAULT FALSE,
        is_list BOOLEAN DEFAULT TRUE,
        is_insert BOOLEAN DEFAULT TRUE,
        is_update BOOLEAN DEFAULT TRUE,
        is_query BOOLEAN DEFAULT FALSE,
        query_type VARCHAR(32),
        sort INT DEFAULT 0
      )
    `);

    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_gen_col_table ON sys_gen_table_column (table_id)",
    );
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS sys_gen_table_column");
    await executor("DROP TABLE IF EXISTS sys_gen_table");
  },
};
