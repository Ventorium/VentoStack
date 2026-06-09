import type { Migration } from "@ventostack/database";

/**
 * 为所有业务模型补充缺失的 sort / remark 字段
 *
 * sort 字段缺失: dict_type, config, notice, i18n_locale, notify_template
 * remark 字段缺失: menu, dept, notice, i18n_locale, i18n_message, notify_template
 *
 * 使用 DO $$ ... EXCEPTION 跳过不存在的表（平台模块表可能未启用）
 */

async function safeAlter(executor: (sql: string, params?: unknown[]) => Promise<unknown>, sql: string): Promise<void> {
  try {
    await executor(sql);
  } catch {
    // 表不存在时跳过（平台模块可能未启用）
  }
}

export const addSortRemark: Migration = {
  name: "010_add_sort_remark",

  async up(executor) {
    // ===== sort 字段 =====
    await safeAlter(executor, `ALTER TABLE sys_dict_type ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0`);
    await safeAlter(executor, `ALTER TABLE sys_config ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0`);
    await safeAlter(executor, `ALTER TABLE sys_notice ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_locale ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0`);
    await safeAlter(executor, `ALTER TABLE sys_notify_template ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0`);

    // ===== remark 字段 =====
    await safeAlter(executor, `ALTER TABLE sys_menu ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
    await safeAlter(executor, `ALTER TABLE sys_dept ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
    await safeAlter(executor, `ALTER TABLE sys_notice ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_locale ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_message ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
    await safeAlter(executor, `ALTER TABLE sys_notify_template ADD COLUMN IF NOT EXISTS remark VARCHAR(512)`);
  },

  async down(executor) {
    // sort columns
    await safeAlter(executor, `ALTER TABLE sys_dict_type DROP COLUMN IF EXISTS sort`);
    await safeAlter(executor, `ALTER TABLE sys_config DROP COLUMN IF EXISTS sort`);
    await safeAlter(executor, `ALTER TABLE sys_notice DROP COLUMN IF EXISTS sort`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_locale DROP COLUMN IF EXISTS sort`);
    await safeAlter(executor, `ALTER TABLE sys_notify_template DROP COLUMN IF EXISTS sort`);

    // remark columns
    await safeAlter(executor, `ALTER TABLE sys_menu DROP COLUMN IF EXISTS remark`);
    await safeAlter(executor, `ALTER TABLE sys_dept DROP COLUMN IF EXISTS remark`);
    await safeAlter(executor, `ALTER TABLE sys_notice DROP COLUMN IF EXISTS remark`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_locale DROP COLUMN IF EXISTS remark`);
    await safeAlter(executor, `ALTER TABLE sys_i18n_message DROP COLUMN IF EXISTS remark`);
    await safeAlter(executor, `ALTER TABLE sys_notify_template DROP COLUMN IF EXISTS remark`);
  },
};
