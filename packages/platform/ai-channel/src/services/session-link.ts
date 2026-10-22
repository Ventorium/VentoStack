/**
 * 外部会话 ↔ AI 会话绑定（业务层）
 *
 * 核心不变式：**同一个 externalKey 恒定指向同一个 sessionId**。
 * 因此用户在 QQ 里回复「失败在哪一步」，接的是 Web 会话那份完整上下文。
 *
 * 自愈：AI 侧删会话是软删除到回收站，渠道模块不感知（避免跨模块事件耦合）。
 * 入站时懒校验 sessionId 是否还存在，不存在就新建并改写绑定——
 * 用户在 Web 删了会话后继续在微信聊，会自动开一段新对话，不报错。
 */

import type { Database } from '@ventostack/database';
import { createChannelSessionDao } from '../models/session-link';
import type { ChannelSessionDao } from '../models/session-link';
import type { AiSessionServiceLike } from '../types';
import type { ChannelSessionRow } from '../types';

export interface ResolveSessionParams {
  channelId: string;
  channelType: string;
  tenantId: string;
  userId: string;
  externalKey: string;
  /** 渠道配置的默认 Agent；未配置时用平台默认 */
  agentId: string;
  replyContext?: Record<string, unknown>;
}

export interface ResolveSessionResult {
  sessionId: string;
  /** 是否本次新建（用于「已开启新对话」这类提示） */
  created: boolean;
}

export interface SessionLinkService {
  /** 入站解析：命中则复用，未命中或已失效则新建并绑定 */
  resolve(params: ResolveSessionParams): Promise<ResolveSessionResult>;
  /** 显式绑定（/新对话、/切换、channel_send 反向绑定） */
  bind(params: {
    channelId: string;
    tenantId: string;
    userId: string;
    externalKey: string;
    sessionId: string;
    agentId?: string | null;
    origin: 'inbound' | 'notify';
    replyContext?: Record<string, unknown>;
  }): Promise<void>;
  /** 查绑定（用于判断「当前会话是否就在该渠道」） */
  findKey(channelId: string, sessionId: string): Promise<ChannelSessionRow | null>;
  touch(channelId: string, externalKey: string): Promise<void>;
  /** 清掉绑定（/新对话 前调用，防止旧绑定残留） */
  unbind(channelId: string, externalKey: string): Promise<void>;
}

export function createSessionLinkService(deps: {
  db: Database;
  ai: AiSessionServiceLike;
}): SessionLinkService {
  const { ai } = deps;
  const dao: ChannelSessionDao = createChannelSessionDao({ db: deps.db });

  return {
    async resolve(params: ResolveSessionParams): Promise<ResolveSessionResult> {
      const existing = await dao.findByKey(params.channelId, params.externalKey);
      if (existing) {
        // 懒校验：会话被删/进了回收站 → 自愈为新会话
        const alive = await ai.get(existing.session_id, {
          tenantId: params.tenantId,
          userId: params.userId,
        });
        if (alive) {
          await dao.touch(params.channelId, params.externalKey);
          return { sessionId: existing.session_id, created: false };
        }
      }

      const { sessionId } = await ai.create({
        tenantId: params.tenantId,
        userId: params.userId,
        agentId: params.agentId,
        origin: {
          kind: 'channel',
          channelId: params.channelId,
          channelType: params.channelType,
        },
      });
      await dao.upsert({
        channelId: params.channelId,
        tenantId: params.tenantId,
        userId: params.userId,
        externalKey: params.externalKey,
        sessionId,
        agentId: params.agentId,
        origin: 'inbound',
        ...(params.replyContext ? { replyContext: params.replyContext } : {}),
      });
      return { sessionId, created: true };
    },

    async bind(params): Promise<void> {
      await dao.upsert({
        channelId: params.channelId,
        tenantId: params.tenantId,
        userId: params.userId,
        externalKey: params.externalKey,
        sessionId: params.sessionId,
        agentId: params.agentId ?? null,
        origin: params.origin,
        ...(params.replyContext ? { replyContext: params.replyContext } : {}),
      });
    },

    async findKey(channelId: string, sessionId: string): Promise<ChannelSessionRow | null> {
      const rows = await dao.findBySession(channelId, sessionId);
      return rows[0] ?? null;
    },

    async touch(channelId: string, externalKey: string): Promise<void> {
      await dao.touch(channelId, externalKey);
    },

    async unbind(channelId: string, externalKey: string): Promise<void> {
      await dao.remove(channelId, externalKey);
    },
  };
}
