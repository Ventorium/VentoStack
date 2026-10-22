/**
 * 渠道管理路由（鉴权，逐路由注入 authMiddleware）
 *
 * 归属规则：owner 一律由认证上下文注入，**不接受请求参数**；
 * 跨用户/跨租户统一 404（不返回 403，避免探测资源是否存在）。
 */

import { createRouter, fail, handleError, parseBody, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import { CHANNEL_CATALOG } from '../catalog';
import type { ChannelService } from '../services/channel';
import type { IdentityService } from '../services/identity';
import type { OutboundService } from '../services/outbound';
import type { ChannelRuntime } from '../services/runtime';
import {
  catalogResponseSchema,
  channelListResponseSchema,
  channelResponseSchema,
  deletedResponseSchema,
  healthResponseSchema,
  routeDoc,
  testResponseSchema,
  userOf,
} from './schema';

export interface ChannelRoutesDeps {
  channels: ChannelService;
  identity: IdentityService;
  outbound: OutboundService;
  runtime: ChannelRuntime;
  publicBaseUrl?: string;
}

export function createChannelRoutes(
  deps: ChannelRoutesDeps,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  const guard = [authMiddleware, perm('ai:channel', 'use')];

  // 渠道类型目录：前端据此渲染「添加渠道」网格与配置表单
  router.get(
    '/api/ai/channels/catalog',
    routeDoc('获取渠道类型目录（字段定义 / 默认值 / 接入引导）', {
      responses: { 200: catalogResponseSchema },
    }),
    async (ctx) => {
      try {
        if (!userOf(ctx)) return fail('未登录', 401, 401);
        return success({
          publicBaseUrl: deps.publicBaseUrl ?? null,
          // 目录本身就是「前端渲染用的纯元数据」，这里整条透传、只把 null 归一成
          // 前端好处理的形态。不逐个白名单：之前白名单漏了 setupLinks，
          // 目录里配了链接但接口不返回，页面静默没链接，排查成本很高。
          items: CHANNEL_CATALOG.map((entry) => ({
            ...entry,
            requiresLogin: entry.requiresLogin === true,
            warning: entry.warning ?? null,
            docsUrl: entry.docsUrl ?? null,
            setupLinks: entry.setupLinks ?? [],
          })),
        });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 我的渠道列表
  router.get(
    '/api/ai/channels',
    routeDoc('获取我的渠道列表', {
      responses: { 200: channelListResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const items = await deps.channels.list(user);
        return success({ items });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 新建
  router.post(
    '/api/ai/channels',
    routeDoc('新建渠道', {
      body: {
        type: { type: 'string', required: true, description: '渠道类型（见 catalog）' },
        name: { type: 'string', description: '展示名，缺省为「我的{渠道名}」' },
        config: { type: 'object', description: '非密配置' },
        secrets: { type: 'object', description: '凭证（加密存储，不回显）' },
        agentId: { type: 'string', description: '绑定的 Agent，缺省用平台默认' },
      },
      responses: { 200: channelResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const body = await parseBody(ctx.request);
        const channel = await deps.channels.create({
          ...user,
          type: String(body.type ?? ''),
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.config && typeof body.config === 'object'
            ? { config: body.config as Record<string, unknown> }
            : {}),
          ...(body.secrets && typeof body.secrets === 'object'
            ? { secrets: body.secrets as Record<string, string> }
            : {}),
          ...(body.agentId !== undefined ? { agentId: String(body.agentId) } : {}),
        });
        return success(channel);
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 更新（secrets 空值 = 不修改）
  router.patch(
    '/api/ai/channels/:id',
    routeDoc('更新渠道', {
      body: {
        name: { type: 'string', description: '展示名' },
        config: { type: 'object', description: '非密配置（按字段合并）' },
        secrets: { type: 'object', description: '凭证；留空表示不修改' },
        agentId: { type: 'string', description: '绑定的 Agent' },
      },
      responses: { 200: channelResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const body = await parseBody(ctx.request);
        const channel = await deps.channels.update(id, user, {
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.config && typeof body.config === 'object'
            ? { config: body.config as Record<string, unknown> }
            : {}),
          ...(body.secrets && typeof body.secrets === 'object'
            ? { secrets: body.secrets as Record<string, string> }
            : {}),
          ...(body.agentId !== undefined ? { agentId: String(body.agentId) } : {}),
        });
        return success(channel);
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 删除（级联 identity / session 绑定；不删 AI 会话本体）
  router.delete(
    '/api/ai/channels/:id',
    routeDoc('删除渠道', {
      responses: { 200: deletedResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        // 先停连接再删数据：否则残留轮询会持续拉取已删渠道
        await deps.runtime.stop(id);
        await deps.channels.remove(id, user);
        return success({ deleted: true });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 启用：先 prepare + health，失败 400 带原因
  router.post(
    '/api/ai/channels/:id/enable',
    routeDoc('启用渠道', {
      responses: { 200: channelResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.markEnabled(id, user);
        // 拉起连接（扫码类未登录时保持 pending_login，不报错）
        await deps.runtime.reload(id);
        const refreshed = await deps.channels.get(id, user);
        return success(refreshed ?? channel);
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 停用
  router.post(
    '/api/ai/channels/:id/disable',
    routeDoc('停用渠道', {
      responses: { 200: channelResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.disable(id, user);
        await deps.runtime.reload(id);
        return success(channel);
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 主动探活
  router.post(
    '/api/ai/channels/:id/health',
    routeDoc('渠道探活', {
      responses: { 200: healthResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const channel = await deps.channels.get(id, user);
        if (!channel) return fail('渠道不存在', 404, 404);
        return success({ status: channel.status, detail: channel.statusDetail });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  // 发送测试消息：验证凭证与出站链路
  router.post(
    '/api/ai/channels/:id/test',
    routeDoc('发送测试消息', {
      body: { text: { type: 'string', description: '自定义文案，缺省为固定测试语' } },
      responses: { 200: testResponseSchema },
    }),
    async (ctx) => {
      try {
        const user = userOf(ctx);
        if (!user) return fail('未登录', 401, 401);
        const id = (ctx.params as Record<string, string>).id ?? '';
        const body = await parseBody(ctx.request);
        const channel = await deps.channels.get(id, user);
        if (!channel) return fail('渠道不存在', 404, 404);

        const target = await deps.identity.resolveTarget(id, user.tenantId, user.userId);
        if (!target) {
          return fail('尚未绑定账号：请先生成绑定码并在渠道内发送 /绑定 验证码', 400, 400);
        }
        const text =
          typeof body.text === 'string' && body.text.trim()
            ? body.text.trim()
            : '这是一条来自 VentoStack 的测试消息，收到即表示渠道已打通。';

        // 测试消息用该渠道最近一次入站上下文（微信/QQ 必须）
        const result = await deps.outbound.send({
          channelId: id,
          tenantId: user.tenantId,
          target: {
            externalUserId: target.externalUserId,
            externalChatId: target.externalChatId,
          },
          text,
          kind: 'notify',
          externalKey: null,
          sessionId: null,
        });
        if (!result.ok) return fail(result.error ?? '发送失败', 400, 400);
        return success({ sent: true });
      } catch (e) {
        return handleError(e);
      }
    },
    ...guard,
  );

  return router;
}
