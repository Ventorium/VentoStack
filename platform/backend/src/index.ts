#!/usr/bin/env bun
/**
 * @ventostack/backend — 管理后台服务端
 *
 * 职责仅限于：生命周期管理、优雅关停、顶层错误边界。
 * 业务装配逻辑全部委托给 app.ts（Composition Root）。
 *
 * 启动方式：
 *   bun run src/index.ts                          # 开发模式
 *   NODE_ENV=production bun run src/index.ts      # 生产模式
 *
 * 环境变量参考 .env.example
 */

import { env } from "./config";
import { buildApp, type AppContext } from "./app";

let appCtx: AppContext | null = null;

async function main(): Promise<void> {
  // =============================================
  // 装配
  // =============================================

  console.log("");

  appCtx = await buildApp();

  // =============================================
  // 启动
  // =============================================

  await appCtx.app.listen();

  console.log(`[server] Listening on http://${env.HOST}:${env.PORT}`);
  console.log(`[server] Environment: ${env.NODE_ENV}`);
  console.log("");
}

// ===============================================
// 顶层错误边界
// ===============================================

main().catch((err) => {
  console.error("[fatal] Startup failed:");
  console.error(err);
  process.exit(1);
});

// ===============================================
// 优雅关停
// ===============================================

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT", "SIGQUIT"] as const;

for (const signal of SHUTDOWN_SIGNALS) {
  process.on(signal, async () => {
    console.log(`\n[server] Received ${signal}, shutting down gracefully...`);

    // 移除所有信号处理器，防止重复触发
    for (const s of SHUTDOWN_SIGNALS) {
      process.removeAllListeners(s);
    }

    try {
      if (appCtx) {
        await appCtx.app.close();
        // 关闭数据库连接等基础设施
      }
      console.log("[server] Shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[server] Shutdown error:", err);
      process.exit(1);
    }
  });
}
