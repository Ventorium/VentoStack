/**
 * 身份绑定与消息记录路由
 *
 * 绑定码流程：Web 端生成 6 位码（TTL 5 分钟）→ 用户在渠道内发 `/绑定 123456` →
 * 服务端校验归属/有效期/一次性 → 写 identity。
 */

import { createRouter, fail, handleError, pageOf, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { createMessageDao } from '../models/message';
import type { ChannelService } from '../services/channel';
import type { IdentityService } from '../services/identity';
import type { AiSessionServiceLike } from '../types';
import {
  bindCodeResponseSchema,
  identityListResponseSchema,
  messageListResponseSchema,
  routeDoc,
  unbindResponseSchema,
  userOf,
} from './schema';

export interface BindingRoutesDeps {
  db: Database;
  channels: ChannelService;
  identity: IdentityService;
  ai: AiSessionServiceLike;
}

export function createBindingRoutes(
  deps: BindingRoutesDeps,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  const guard = [authMiddleware, perm('ai:channel', 'use')];
  const messageDao = createMessageDao({ db: deps.db });

  // 已绑定账号（脱敏）
  router.get(
    '/api/ai/channels/:id/identities',
    routeDoc('获取渠道已绑定账号', {
      responses: { 200: identityListResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.get(id, user);
        if (!channel) return fail('渠道不存在', 404, 404);
        const rows = await deps.identity.listByChannel(id, user);
        return success({
          items: rows.map((row) => ({
            id: row.id,
            externalUserId: `${row.external_user_id.slice(0, 4)}***`,
            displayName: row.display_name,
            verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
            createdAt: row.created_at.toISOString(),
          })),
        });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 生成绑定码
  router.post(
    '/api/ai/channels/:id/bind-code',
    routeDoc('生成账号绑定码（6 位，5 分钟有效）', {
      responses: { 200: bindCodeResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.get(id, user);
        if (!channel) return fail('渠道不存在', 404, 404);
        const info = await deps.identity.issueBindCode(id, user);
        return success({
          code: info.code,
          expiresAt: info.expiresAt,
          instruction: `在${channel.name}中向机器人发送：/绑定 ${info.code}`,
        });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 解绑
  router.delete(
    '/api/ai/channels/:id/identities/:identityId',
    routeDoc('解绑账号', {
      responses: { 200: unbindResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const params = ctx.params as Record<string, string>;
        const ok = await deps.identity.unbind(params.identityId ?? '', user);
        if (!ok) return fail('绑定不存在', 404, 404);
        return success({ unbound: true });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 最近收发记录（脱敏摘要）
  router.get(
    '/api/ai/channels/:id/messages',
    routeDoc('获取渠道最近收发记录（脱敏摘要）', {
      query: {
        page: { type: 'int', description: '页码（默认 1）' },
        pageSize: { type: 'int', description: '每页数量（默认 20，最大 100）' },
      },
      responses: { 200: messageListResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.get(id, user);
        if (!channel) return fail('渠道不存在', 404, 404);

        const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
        const limit = Math.min(Math.max(pageSize, 1), 100);
        const offset = (Math.max(page, 1) - 1) * limit;
        const [rows, total] = await Promise.all([
          messageDao.listRecent(id, user.tenantId, limit, offset),
          messageDao.countRecent(id, user.tenantId),
        ]);
        return success({
          list: rows.map((row) => ({
            id: row.id,
            direction: row.direction,
            kind: row.kind,
            status: row.status,
            sessionId: row.session_id,
            // 只回预览，控制面不暴露完整正文
            preview: row.payload_preview ?? '',
            error: row.error,
            attempts: row.attempts,
            createdAt: row.created_at.toISOString(),
          })),
          total,
          page,
          pageSize: limit,
        });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  return router;
}
