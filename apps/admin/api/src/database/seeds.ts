/**
 * 种子数据注册与执行（幂等）
 *
 * 种子数据（admin、config、dict）均为本应用专属数据。
 */

import { createTagLogger } from "@ventostack/core";
import { type SqlExecutor, createSeedRunner } from "@ventostack/database";
import { initAdminSeed } from "./seeds/001_init_admin";
import { initConfigSeed } from "./seeds/002_init_config";
import { initDictSeed } from "./seeds/003_init_dict";
import { addDashboardMenuSeed } from "./seeds/004_add_dashboard_menu";
import { addWorkflowMenuSeed } from "./seeds/005_add_workflow_menu";

const log = createTagLogger("seeds");

export async function runSeeds(executor: SqlExecutor): Promise<void> {
  const runner = createSeedRunner(executor);
  runner.addSeed(initAdminSeed);
  runner.addSeed(initConfigSeed);
  runner.addSeed(initDictSeed);
  runner.addSeed(addDashboardMenuSeed);
  runner.addSeed(addWorkflowMenuSeed);

  await runner.run();
  log.info("All seeds executed");
}
