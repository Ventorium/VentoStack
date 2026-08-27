/**
 * @ventostack/ai-trace - 模块聚合
 *
 * 订阅框架 AI 模块事件流，将 agent loop 链路落库并提供追踪查询 API。
 * 依赖注入：db + AI 事件发射器 + 配置读取提供者 + 认证/权限。
 */

import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import type { JWTManager, RBAC } from "@ventostack/auth";
import { createTagLogger, type Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createTraceConfigService } from "./services/trace-config";
import type { TraceConfigProvider, TraceConfigService } from "./services/trace-config";
import { createTraceRecorder } from "./services/recorder";
import type { TraceRecorder } from "./services/recorder";
import { createTraceStore } from "./services/trace-store";
import type { TraceStore } from "./services/trace-store";
import { createTraceRoutes } from "./routes/trace";
import type { TraceEventEmitter } from "./types";

/** 陈旧 running 追踪的判定阈值（1 小时） */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;
/** 陈旧清理周期（5 分钟） */
const STALE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const logger = createTagLogger("ai-trace");

export interface AiTraceModule {
  services: {
    store: TraceStore;
    config: TraceConfigService;
    recorder: TraceRecorder;
  };
  router: Router;
  init(): Promise<void>;
}

export interface AiTraceModuleDeps {
  db: Database;
  /** 框架 AI 模块的事件发射器（createAIModule().services.eventEmitter） */
  emitter: TraceEventEmitter;
  /** 配置读取提供者（system 模块的 configService） */
  configProvider: TraceConfigProvider;
  jwt: JWTManager;
  jwtSecret: string;
  /** RBAC 管理器实例（必填，避免权限校验被静默跳过） */
  rbac: RBAC;
}

export function createAiTraceModule(deps: AiTraceModuleDeps): AiTraceModule {
  const { db, emitter, configProvider, jwt, jwtSecret, rbac } = deps;

  const store = createTraceStore({ db });
  const config = createTraceConfigService({ db, configProvider });
  const recorder = createTraceRecorder({ emitter, store, toggle: config });

  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const router = createTraceRoutes(store, config, authMiddleware, perm);

  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  return {
    services: { store, config, recorder },
    router,
    async init(): Promise<void> {
      // 启动事件订阅与陈旧追踪清理（进程崩溃等场景遗留的 running 记录）
      recorder.start();
      await store.markStaleTraces(STALE_THRESHOLD_MS);
      sweepTimer = setInterval(() => {
        void store.markStaleTraces(STALE_THRESHOLD_MS).catch((err) => {
          logger.error(`清理陈旧追踪失败: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, STALE_SWEEP_INTERVAL_MS);
      sweepTimer.unref?.();
    },
  };
}
