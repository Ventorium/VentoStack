import { createExampleApp } from "./app";
import { config } from "./config";
import { db, runMigrations } from "./database";

// ── 启动应用 ─────────────────────────────────────────

const { app, userService, logger } = await createExampleApp({ db, config });

// ── 数据库迁移与种子 ────────────────────────────────

await runMigrations();
logger.info("database migrations completed");

const existingAdmin = await userService.getUserByEmail("admin@example.com");
if (!existingAdmin) {
  await userService.createUser({
    name: "Admin",
    email: "admin@example.com",
    password: "admin12345",
    role: "admin",
  });
  logger.info("seeded default admin user");
}

// ── 优雅关闭 ────────────────────────────────────────

process.on("SIGINT", async () => {
  logger.info("shutting down gracefully");
  await app.close();
  await db.close();
  process.exit(0);
});

// ── 启动 ────────────────────────────────────────────

logger.info("starting VentoStack example app", { port: config.port, env: config.env });
await app.listen();
