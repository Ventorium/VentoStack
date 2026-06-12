/**
 * 数据库迁移注册与执行
 */

import { createTagLogger } from "@ventostack/core";
import { type SqlExecutor, createMigrationRunner } from "@ventostack/database";
import { createI18nTables } from "@ventostack/i18n";
import { createOssTables } from "@ventostack/oss";
import { createSchedulerTables } from "@ventostack/scheduler";
import { createAiKnowledgeTables, createAiAgentTables, createAiProviderTables, createAiSkillTables, addReasoningOptions, addProviderModelsDevSlug } from "@ventostack/ai";
import { createNotifyTables } from "@ventostack/notification";
import { createWorkflowTables, enhanceWorkflowTables, addBusinessType } from "@ventostack/workflow";
import { createSysTables } from "./migrations/001_create_sys_tables";
import { addPasswordChangedAt } from "./migrations/003_password_changed_at";
import { addPasskeySupport } from "./migrations/004_passkey_support";
import { addLoginMethodColumn } from "./migrations/005_login_method_column";
import { addDictDataUnique } from "./migrations/006_dict_data_unique";
import { createRoleDeptTable } from "./migrations/007_create_role_dept_table";
import { removeSysTheme } from "./migrations/008_remove_sys_theme";
import { addDictIsSystem } from "./migrations/009_dict_is_system";
import { addSortRemark } from "./migrations/010_add_sort_remark";

const logger = createTagLogger("migrations");

/**
 * 注册并执行所有迁移
 */
export async function runMigrations(executor: SqlExecutor): Promise<void> {
  const runner = createMigrationRunner(executor);

  runner.addMigration(createSysTables);
  runner.addMigration(addPasswordChangedAt);
  runner.addMigration(addPasskeySupport);
  runner.addMigration(addLoginMethodColumn);
  runner.addMigration(addDictDataUnique);
  runner.addMigration(createRoleDeptTable);
  runner.addMigration(removeSysTheme);
  runner.addMigration(addDictIsSystem);
  runner.addMigration(addSortRemark);

  // 平台模块表结构由 platform packages 提供，注册顺序由 admin 应用控制。
  runner.addMigration(createI18nTables);
  runner.addMigration(createWorkflowTables);
  runner.addMigration(enhanceWorkflowTables);
  runner.addMigration(addBusinessType);
  runner.addMigration(createOssTables);
  runner.addMigration(createNotifyTables);
  runner.addMigration(createSchedulerTables);

  // AI 模块
  runner.addMigration(createAiKnowledgeTables);
  runner.addMigration(createAiAgentTables);
  runner.addMigration(createAiProviderTables);
  runner.addMigration(createAiSkillTables);
  runner.addMigration(addReasoningOptions);
  runner.addMigration(addProviderModelsDevSlug);

  const executed = await runner.up();

  if (executed.length > 0) {
    logger.info(`Executed: ${executed.join(", ")}`);
  } else {
    logger.info("All up to date");
  }
}
