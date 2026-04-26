/**
 * 数据库迁移注册与执行
 */

import { createMigrationRunner, type SqlExecutor } from "@ventostack/database";
import { createSysTables } from "@ventostack/system";

/**
 * 注册并执行所有迁移
 */
export async function runMigrations(executor: SqlExecutor): Promise<void> {
  const runner = createMigrationRunner(executor);

  // ---- 平台层迁移 ----
  runner.addMigration(createSysTables);

  // 此处可添加 future 迁移：
  // runner.addMigration(someFutureMigration);

  const executed = await runner.up();

  if (executed.length > 0) {
    console.log(`[migrations] Executed: ${executed.join(", ")}`);
  } else {
    console.log("[migrations] All up to date");
  }
}
