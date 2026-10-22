/**
 * 会话级渠道通知设置路由
 *
 * 设置存在 ai_session_meta.settings.channel（入库，可跨会话查询）：
 * 自动推送要定时扫「哪些会话开了通知」，放 JSONL 里需要遍历全部会话文件，不可接受。
 */

import { createRouter, fail, handleError, parseBody, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { ChannelService } from '../services/channel';
import type { IdentityService } from '../services/identity';
import type { AiSessionServiceLike } from '../types';
import {
  notifySettingsPatchResponseSchema,
  notifySettingsResponseSchema,
  routeDoc,
  userOf,
} from './schema';

export interface ConversationRoutesDeps {
  channels: ChannelService;
  identity: IdentityService;
  ai: AiSessionServiceLike;
}

export function createConversationRoutes(
  deps: ConversationRoutesDeps,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  const guard = [authMiddleware, perm('ai:chat', 'use')];

  // 会话级渠道通知开关（读）
  router.get(
    '/api/ai/conversations/:id/channel-notify',
    routeDoc('读取会话的渠道通知设置', {
      responses: { 200: notifySettingsResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const sessionId = (ctx.params as Record<string, string>).id ?? '';
        const settings = await deps.ai.getSettings(sessionId, user);
        const channels = await deps.channels.list(user);
        const identities = await deps.identity.listByUser(user);
        const boundChannelIds = new Set(identities.map((row) => row.channel_id));
        return success({
          settings: (settings as { channel?: unknown } | null)?.channel ?? null,
          available: channels
            .filter((channel) => channel.enabled)
            .map((channel) => ({
              id: channel.id,
              type: channel.type,
              name: channel.name,
              bound: boundChannelIds.has(channel.id),
            })),
        });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 会话级渠道通知开关（写）
  router.patch(
    '/api/ai/conversations/:id/channel-notify',
    routeDoc('更新会话的渠道通知设置', {
      body: {
        notifyEnabled: { type: 'boolean', description: '是否允许推送结果到渠道' },
        notifyChannelIds: {
          type: 'array',
          items: { type: 'string' },
          description: '指定渠道 id；空数组表示全部已启用渠道',
        },
        autoNotifyOnFinish: {
          type: 'boolean',
          description: '每轮结束是否由子智能体总结后自动推送',
        },
      },
      responses: { 200: notifySettingsPatchResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const sessionId = (ctx.params as Record<string, string>).id ?? '';
        const body = await parseBody(ctx.request);

        const patch: Record<string, unknown> = {};
        if (typeof body.notifyEnabled === 'boolean') patch.notifyEnabled = body.notifyEnabled;
        if (typeof body.autoNotifyOnFinish === 'boolean') {
          patch.autoNotifyOnFinish = body.autoNotifyOnFinish;
        }
        if (Array.isArray(body.notifyChannelIds)) {
          patch.notifyChannelIds = body.notifyChannelIds.filter(
            (item): item is string => typeof item === 'string',
          );
        }
        if (Object.keys(patch).length === 0) return fail('没有需要更新的字段', 400, 400);

        const next = await deps.ai.updateSettings(sessionId, user, { channel: patch });
        return success({ settings: (next as { channel?: unknown }).channel ?? null });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  return router;
}
