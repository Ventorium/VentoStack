/**
 * 种子数据注册与执行（幂等）
 */

import { createSeedRunner, type SqlExecutor } from "@ventostack/database";
import { initAdminSeed } from "@ventostack/system";

export async function runSeeds(executor: SqlExecutor): Promise<void> {
  // 检查是否已初始化
  const [existing] = await executor(
    `SELECT id FROM sys_user WHERE username = 'admin' LIMIT 1`,
  ) as Array<{ id: string }> | [] as any;

  if (existing) {
    console.log("[seeds] Admin user exists, skipping");
    return;
  }

  console.log("[seeds] Creating seed data...");
  const runner = createSeedRunner(executor);
  runner.addSeed(initAdminSeed);

  await runner.run();
  console.log("[seeds] Admin seed created — admin / admin123");
}
