import type { Migration } from "@ventostack/database";

export const createSchedulerTables: Migration = {
  name: "001_create_scheduler_tables",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_schedule_job (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        handler_id VARCHAR(128) NOT NULL,
        cron VARCHAR(64),
        params JSON,
        status SMALLINT DEFAULT 0,
        description VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS sys_schedule_job_log (
        id VARCHAR(36) PRIMARY KEY,
        job_id VARCHAR(36) NOT NULL,
        start_at TIMESTAMP NOT NULL,
        end_at TIMESTAMP,
        status SMALLINT NOT NULL,
        result TEXT,
        error TEXT,
        duration_ms INT
      )
    `);

    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_job_log_job ON sys_schedule_job_log (job_id)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_job_log_time ON sys_schedule_job_log (start_at)",
    );
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS sys_schedule_job_log");
    await executor("DROP TABLE IF EXISTS sys_schedule_job");
  },
};
