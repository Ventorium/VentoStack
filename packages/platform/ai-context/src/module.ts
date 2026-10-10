/**
 * @ventostack/ai-context — 模块聚合
 *
 * 订阅框架 AI 模块事件流，把每次模型请求的上下文构成落库，
 * 并提供概览/会话列表/会话详情查询 API（**仅超级管理员**可访问）。
 * 采集开关按 Agent 判定（ai_agent.context_collection_enabled），默认关闭。
 * 依赖注入：db + AI 事件发射器 + 认证引擎。
 */

import { createAuthMiddleware } from "@ventostack/auth";
import type { JWTManager } from "@ventostack/auth";
import { createTagLogger, type Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createContextToggleService } from "./services/context-config";
import type { ContextToggleService } from "./services/context-config";
import { createContextQueries } from "./services/context-queries";
import type { ContextQueries } from "./services/context-queries";
import { createContextStore } from "./services/context-store";
import type { ContextStore } from "./services/context-store";
import { createContextRecorder } from "./services/recorder";
import type { ContextRecorder } from "./services/recorder";
import { createContextRoutes } from "./routes/context";
import type { ContextEventEmitter } from "./shared/types";

/** 陈旧 running 会话的判定阈值（1 小时） */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;
/** 陈旧清理周期（5 分钟） */
const STALE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const logger = createTagLogger("ai-context");

export interface AiContextModule {
  services: {
    store: ContextStore;
    queries: ContextQueries;
    toggle: ContextToggleService;
    recorder: ContextRecorder;
  };
  router: Router;
  init(): Promise<void>;
}

export interface AiContextModuleDeps {
  db: Database;
  /** 框架 AI 模块的事件发射器（createAIModule().services.eventEmitter） */
  emitter: ContextEventEmitter;
  jwt: JWTManager;
  jwtSecret: string;
  tenantId: string;
}

export function createAiContextModule(deps: AiContextModuleDeps): AiContextModule {
  const { db, emitter, jwt, jwtSecret, tenantId } = deps;

  // 租户是必填依赖：缺失则 fail-closed，绝不退化为共享视图（CLAUDE.md §16）
  if (!tenantId || tenantId.trim() === "") {
    throw new Error("@ventostack/ai-context: tenantId 不能为空（租户隔离要求 fail-closed）");
  }

  const store = createContextStore({ db });
  const queries = createContextQueries(db);
  const toggle = createContextToggleService({ db });
  const recorder = createContextRecorder({ emitter, store, toggle });

  const authMiddleware = createAuthMiddleware(jwt, jwtSecret, tenantId);
  const router = createContextRoutes(queries, authMiddleware);

  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  return {
    services: { store, queries, toggle, recorder },
    router,
    async init(): Promise<void> {
      recorder.start();
      await store.markStaleSessions(STALE_THRESHOLD_MS);
      sweepTimer = setInterval(() => {
        void store.markStaleSessions(STALE_THRESHOLD_MS).catch((err) => {
          logger.error(
            `清理陈旧会话失败: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }, STALE_SWEEP_INTERVAL_MS);
      sweepTimer.unref?.();
    },
  };
}