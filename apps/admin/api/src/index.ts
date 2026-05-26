#!/usr/bin/env bun
/**
 * @ventostack/backend — 管理后台服务端
 *
 * 职责仅限于：生命周期管理、顶层错误边界。
 * 优雅关停由框架 createApp 内置的 SIGTERM/SIGINT 处理。
 * 业务装配逻辑全部委托给 app.ts（Composition Root）。
 *
 * 启动方式：
 *   bun run src/index.ts                          # 开发模式
 *   NODE_ENV=production bun run src/index.ts      # 生产模式
 *
 * 环境变量参考 .env.example
 */

import { createTagLogger } from "@ventostack/core";
import { env } from "./config";
import { buildApp, type AppContext } from "./app";
import { serverLogger } from "./logger";

let appCtx: AppContext | null = null;

async function main(): Promise<void> {

  appCtx = await buildApp();

  // 框架 createApp.listen() 内部注册了 SIGTERM/SIGINT 处理：
  // 1. 设置 isClosing=true，新请求返回 503
  // 2. 等待活跃请求最多 30 秒
  // 3. 执行 lifecycle.onBeforeStop()
  // 4. 关闭 HTTP 服务
  // 5. process.exit(0)
  await appCtx.app.listen();

  // 后端启动后自动生成前端 SDK 类型（仅开发模式）
  if (env.NODE_ENV !== "production") {
    const genLog = createTagLogger("gen:sdk");
    const webDir = import.meta.dir.replace("/apps/admin/api/src", "/apps/admin/web");
    Bun.spawn({
      cmd: ["bun", "run", "gen:sdk"],
      cwd: webDir,
      stdout: "pipe",
      stderr: "pipe",
      onExit(subprocess, exitCode) {
        if (exitCode === 0) {
          genLog.info("前端 SDK 类型已更新");
        } else {
          genLog.warn(`生成失败 (exit code ${exitCode})`);
        }
      },
    });
  }
}

// ===============================================
// 顶层错误边界 — 捕获启动阶段的不可恢复错误
// ===============================================

main().catch((err) => {
  serverLogger.error("Startup failed:");
  console.error(err);
  process.exit(1);
});
