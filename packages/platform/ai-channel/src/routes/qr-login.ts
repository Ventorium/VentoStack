/**
 * 扫码登录路由（仅 weixin-ilink）
 *
 * 为什么必须做成「可重复进入」的流程而不是一次性配置：
 * 官方插件的 bot_token 约 24 小时需重新扫码，且每次扫码 ilink_bot_id 会变化。
 * 所以 UI 上永远保留「去扫码」入口，状态为 pending_login 时优先引导扫码。
 */

import { createRouter, fail, handleError, parseBody, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import { getQrLoginAdapter } from '../adapters';
import type { ChannelService } from '../services/channel';
import type { ChannelRuntime } from '../services/runtime';
import { qrBeginResponseSchema, qrStatusResponseSchema, routeDoc, userOf } from './schema';

export interface QrLoginRoutesDeps {
  channels: ChannelService;
  runtime: ChannelRuntime;
}

export function createQrLoginRoutes(
  deps: QrLoginRoutesDeps,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  const guard = [authMiddleware, perm('ai:channel', 'use')];

  async function loadConfig(id: string, user: { tenantId: string; userId: string }) {
    const channel = await deps.channels.get(id, user);
    if (!channel) return null;
    const cfg = await deps.channels.getRuntimeConfig(id, user);
    return cfg ? { channel, cfg } : null;
  }

  /**
   * 登录成功后的落库动作：凭证 + botId + baseUrl，然后自动启用并建连。
   * 轮询与「提交验证码」两条路径共用——早期只有轮询路径做了落库，
   * 需要验证码的账号即使 confirmed 也拿不到 token。
   */
  async function persistConfirmed(
    id: string,
    user: { tenantId: string; userId: string },
    loaded: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
    result: { secrets?: Record<string, string>; configPatch?: Record<string, unknown> },
  ): Promise<void> {
    if (result.secrets || result.configPatch) {
      await deps.channels.update(id, user, {
        ...(result.secrets ? { secrets: result.secrets } : {}),
        ...(result.configPatch
          ? {
              config: {
                ...loaded.channel.config,
                ...result.configPatch,
                baseUrl: String(result.configPatch.baseUrl ?? loaded.channel.config.baseUrl ?? ''),
              },
            }
          : {}),
      });
    }
    await deps.channels.markEnabled(id, user);
    await deps.runtime.reload(id);
  }

  router.post(
    '/api/ai/channels/:id/qr-login/begin',
    routeDoc('获取微信扫码登录二维码', {
      responses: { 200: qrBeginResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const loaded = await loadConfig(id, user);
        if (!loaded) return fail('渠道不存在', 404, 404);

        const qr = getQrLoginAdapter(loaded.cfg.type);
        if (!qr) return fail('该渠道类型不支持扫码登录', 400, 400);

        const result = await qr.beginLogin(loaded.cfg);
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  router.get(
    '/api/ai/channels/:id/qr-login/status',
    routeDoc('轮询扫码状态（confirmed 时自动落库并启用）', {
      query: {
        qrcode: { type: 'string', required: true, description: '二维码标识' },
        verifyCode: { type: 'string', description: '需要验证码时提交' },
      },
      responses: { 200: qrStatusResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const query = ctx.query as Record<string, unknown>;
        const qrcode = typeof query.qrcode === 'string' ? query.qrcode : '';
        if (!qrcode) return fail('缺少 qrcode 参数', 400, 400);

        const loaded = await loadConfig(id, user);
        if (!loaded) return fail('渠道不存在', 404, 404);
        const qr = getQrLoginAdapter(loaded.cfg.type);
        if (!qr) return fail('该渠道类型不支持扫码登录', 400, 400);

        const result = await qr.pollLogin(
          loaded.cfg,
          qrcode,
          typeof query.verifyCode === 'string' ? query.verifyCode : undefined,
        );

        if (result.status !== 'confirmed') {
          return success({ status: result.status, detail: result.detail ?? null });
        }

        await persistConfirmed(id, user, loaded, result);
        return success({ status: 'confirmed' });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  router.post(
    '/api/ai/channels/:id/qr-login/verify-code',
    routeDoc('提交扫码验证码', {
      body: {
        qrcode: { type: 'string', required: true, description: '二维码标识' },
        verifyCode: { type: 'string', required: true, description: '手机收到的验证码' },
      },
      responses: { 200: qrStatusResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const body = await parseBody(ctx.request);
        const qrcode = String(body.qrcode ?? '');
        const verifyCode = String(body.verifyCode ?? '');
        if (!qrcode || !verifyCode) return fail('缺少 qrcode 或 verifyCode', 400, 400);

        const loaded = await loadConfig(id, user);
        if (!loaded) return fail('渠道不存在', 404, 404);
        const qr = getQrLoginAdapter(loaded.cfg.type);
        if (!qr) return fail('该渠道类型不支持扫码登录', 400, 400);

        const result = await qr.pollLogin(loaded.cfg, qrcode, verifyCode);
        if (result.status === 'confirmed') await persistConfirmed(id, user, loaded, result);
        return success({ status: result.status, detail: result.detail ?? null });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  return router;
}
