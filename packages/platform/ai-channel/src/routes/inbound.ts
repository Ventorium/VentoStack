/**
 * 匿名入站路由
 *
 * 唯一凭证是平台签名（各 adapter 内验签），因此**不能**挂在全局 authMiddleware 下。
 * 防护：channelId 必须存在且启用（否则统一 404 不泄露存在性）、body 大小上限在
 * adapter 内校验、按 IP + channelId 粗限流。
 */

import { createRouter } from '@ventostack/core';
import type { Router } from '@ventostack/core';
import type { InboundService } from '../services/inbound';
import { routeDoc } from './schema';

/** 入站限流：单渠道单 IP 每分钟 120 次（平台重投也够用） */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

export function createInboundRoutes(deps: { inbound: InboundService }): Router {
  const router = createRouter();
  const hits = new Map<string, number[]>();

  function allow(channelId: string, ip: string): boolean {
    const key = `${channelId}:${ip}`;
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((ts) => ts > now - WINDOW_MS);
    if (list.length >= MAX_PER_WINDOW) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    return true;
  }

  async function handler(ctx: {
    request: Request;
    params: Record<string, string>;
    ip?: string;
  }): Promise<Response> {
    const channelId = ctx.params.channelId ?? '';
    if (!channelId) return new Response('not found', { status: 404 });
    if (!allow(channelId, ctx.ip ?? 'unknown')) {
      return new Response('too many requests', { status: 429 });
    }
    return deps.inbound.handleWebhook(channelId, ctx.request);
  }

  // GET 用于企微/飞书的 URL 验证，POST 用于消息推送
  // 响应体由各平台约定（明文 echostr / 平台 JSON），不纳入统一 JSON 契约
  router.get('/api/ai/channels/inbound/:channelId', routeDoc('渠道入站回调（URL 验证）'), handler);

  router.post(
    '/api/ai/channels/inbound/:channelId',
    routeDoc('渠道入站回调（消息推送，验签即认证）'),
    handler,
  );

  return router;
}
