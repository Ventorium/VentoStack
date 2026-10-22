/**
 * @ventostack/ai-channel — 模块聚合
 *
 * 职责：个人级对话渠道的配置、启停、双向消息管线，以及「会话结果推送」。
 *
 * 与 @ventostack/ai 的关系是**单向**的：本包只消费 AI 暴露的
 * sessionService / agentLoop / createToolRegistry / llmGateway，
 * 绝不反向 import（避免循环依赖，也让 ai 保持可选依赖语义）。
 */

import type { Cache } from '@ventostack/cache';
import type { ConfigEncryptor } from '@ventostack/core';
import { type Middleware, type Router, createTagLogger } from '@ventostack/core';
import { createRouter } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { getAdapter } from './adapters';
import { createBindingRoutes } from './routes/binding';
import { createChannelRoutes } from './routes/channel';
import { createConversationRoutes } from './routes/conversation';
import { createInboundRoutes } from './routes/inbound';
import { createQrLoginRoutes } from './routes/qr-login';
import { createChannelService } from './services/channel';
import type { ChannelService } from './services/channel';
import { createIdentityService } from './services/identity';
import type { IdentityService } from './services/identity';
import { createInboundService } from './services/inbound';
import type { InboundService } from './services/inbound';
import { createNotifierService } from './services/notifier';
import type { NotifierService } from './services/notifier';
import { createOutboundService } from './services/outbound';
import type { OutboundService } from './services/outbound';
import { createChannelRuntime } from './services/runtime';
import type { ChannelRuntime } from './services/runtime';
import { createSessionLinkService } from './services/session-link';
import type { SessionLinkService } from './services/session-link';
import { createChannelTools } from './services/tools';
import type { ChannelToolsFactory } from './services/tools';
import type { AiServicesLike } from './types';

const logger = createTagLogger('ai-channel');

export interface AiChannelModuleDeps {
  db: Database;
  cache?: Cache;
  encryptor: ConfigEncryptor;
  /** AI 侧能力（由 boot 从 AIModule.services 注入） */
  ai: AiServicesLike;
  authMiddleware: Middleware;
  permMiddleware: (resource: string, action: string) => Middleware;
  /** 渠道未显式绑定 Agent 时使用（可缺省，缺省时按租户兜底取第一个可用 Agent） */
  defaultAgentId?: string;
  /** 租户内没有显式默认时的兜底解析器（由 boot 用 AI 模块的 Agent 列表实现） */
  resolveAgentId?(params: { tenantId: string; userId: string }): Promise<string | null>;
  /** 对外可访问地址，用于拼接 webhook 回调 URL */
  publicBaseUrl?: string;
  /** 会话结束钩子是否接管（默认 true） */
  autoNotify?: boolean;
}

export interface AiChannelModule {
  services: {
    channels: ChannelService;
    identity: IdentityService;
    links: SessionLinkService;
    outbound: OutboundService;
    inbound: InboundService;
    runtime: ChannelRuntime;
    notifier: NotifierService;
    /** 供 AI 模块 extraTools 注入：按会话开关返回渠道工具 */
    createTools: ChannelToolsFactory;
  };
  router: Router;
  init(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createAiChannelModule(deps: AiChannelModuleDeps): AiChannelModule {
  const { db, cache, ai } = deps;
  /** 只依赖会话能力的服务拿这个，避免把 agentLoop/工具工厂一起传下去 */
  const session = ai.sessionService;

  const channels = createChannelService({
    db,
    encryptor: deps.encryptor,
    ...(deps.publicBaseUrl ? { publicBaseUrl: deps.publicBaseUrl } : {}),
  });
  const identity = createIdentityService({ db });
  const links = createSessionLinkService({ db, ai: session });
  const outbound = createOutboundService({
    db,
    ...(cache ? { cache } : {}),
    loadConfig: (channelId) => channels.getRuntimeConfig(channelId),
    getAdapter,
  });
  const inbound = createInboundService({
    db,
    ai,
    channels,
    identity,
    links,
    outbound,
    ...(deps.defaultAgentId ? { defaultAgentId: deps.defaultAgentId } : {}),
    ...(deps.resolveAgentId ? { resolveAgentId: deps.resolveAgentId } : {}),
  });
  const runtime = createChannelRuntime({
    channels,
    inbound,
    outbound,
    ...(cache ? { cache } : {}),
  });

  /** 写通知台账：settings.channel.notifiedAt（展示「已通知到微信 14:32」） */
  async function markNotified(sessionId: string, tenantId: string, userId: string): Promise<void> {
    await session
      .updateSettings(
        sessionId,
        { tenantId, userId },
        {
          channel: { notifiedAt: new Date().toISOString() },
        },
      )
      .catch(() => undefined);
  }

  const notifier = createNotifierService({
    db,
    ai,
    identity,
    outbound,
    loadConfig: (channelId, tenantId, userId) =>
      channels.getRuntimeConfig(channelId, { tenantId, userId }),
    listChannels: async (tenantId, userId) => {
      const rows = await channels.list({ tenantId, userId });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        enabled: row.enabled,
      }));
    },
  });

  const createTools = createChannelTools({
    db,
    ai: session,
    channels,
    identity,
    links,
    outbound,
    markNotified,
  });

  const router = createRouter();
  const perm = deps.permMiddleware;
  router.merge(createInboundRoutes({ inbound }));
  router.merge(
    createChannelRoutes(
      {
        channels,
        identity,
        outbound,
        runtime,
        ...(deps.publicBaseUrl ? { publicBaseUrl: deps.publicBaseUrl } : {}),
      },
      deps.authMiddleware,
      perm,
    ),
  );
  router.merge(
    createBindingRoutes({ db, channels, identity, ai: session }, deps.authMiddleware, perm),
  );
  router.merge(createQrLoginRoutes({ channels, runtime }, deps.authMiddleware, perm));
  router.merge(
    createConversationRoutes({ channels, identity, ai: session }, deps.authMiddleware, perm),
  );

  return {
    services: {
      channels,
      identity,
      links,
      outbound,
      inbound,
      runtime,
      notifier,
      createTools,
    },
    router,
    async init(): Promise<void> {
      try {
        await runtime.boot();
      } catch (error) {
        // 渠道启动失败不能拖垮整个应用：记录并继续（其余渠道仍可用）
        logger.error(
          `渠道运行时启动失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    async shutdown(): Promise<void> {
      await runtime.shutdown();
    },
  };
}
