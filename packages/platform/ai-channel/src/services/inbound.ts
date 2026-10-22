/**
 * 入站管线
 *
 * 归一化（adapter 内）→ 幂等 → 身份解析 → 命令 → session 解析 → 串行锁
 * → agentLoop.runStream → 聚合回复 → 出站
 *
 * 为什么幂等放在身份解析之前：平台重投常发生在处理超时之后，此时身份早已绑定；
 * 先去重可以避免「回了两遍绑定提示」。
 *
 * 串行锁**不排队**：IM 里排队体验差且成本不可控，已有运行就直接回提示。
 */

import { createTagLogger } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { getAdapter } from '../adapters';
import { createMessageDao } from '../models/message';
import { createChannelSessionDao } from '../models/session-link';
import { parseCommand } from '../shared/command';
import { maskId, maskSensitive } from '../shared/text';
import type { AiServicesLike, ChannelRuntimeConfig, InboundMessage, SendResult } from '../types';
import type { ChannelService } from './channel';
import { bindGuide, runCommand } from './commands';
import type { IdentityService } from './identity';
import type { OutboundService } from './outbound';
import type { SessionLinkService } from './session-link';

const logger = createTagLogger('ai-channel:inbound');

/** 单轮运行上限：超过就中断并提示，避免 IM 侧长时间静默 */
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export interface InboundServiceDeps {
  db: Database;
  ai: AiServicesLike;
  channels: ChannelService;
  identity: IdentityService;
  links: SessionLinkService;
  outbound: OutboundService;
  /** 渠道未显式绑定 Agent 时使用（平台配置项，可缺省） */
  defaultAgentId?: string;
  /** 仍未确定时按租户兜底取一个可用 Agent；返回 null 表示确实没有 */
  resolveAgentId?(params: { tenantId: string; userId: string }): Promise<string | null>;
}

export interface InboundService {
  /** 处理已归一化的入站消息（长连接/轮询类直接调它） */
  handle(channelId: string, messages: InboundMessage[]): Promise<void>;
  /** webhook 入口：验签 + 解析 + 先 ACK 再后台处理 */
  handleWebhook(channelId: string, req: Request): Promise<Response>;
  stopRun(sessionId: string): boolean;
  isRunning(sessionId: string): boolean;
  /** 优雅关闭：中断所有运行 */
  shutdown(): void;
}

export function createInboundService(deps: InboundServiceDeps): InboundService {
  const { ai, channels, identity, links, outbound } = deps;

  /** 运行中的会话：同会话再来消息直接拒绝，不与正在跑的 run 抢同一份会话历史 */
  const activeRuns = new Map<string, AbortController>();
  const messageDao = createMessageDao({ db: deps.db });
  const sessionDao = createChannelSessionDao({ db: deps.db });

  async function reply(
    cfg: ChannelRuntimeConfig,
    message: InboundMessage,
    text: string,
    sessionId?: string,
    kind: 'reply' | 'notify' = 'reply',
  ): Promise<SendResult> {
    return outbound.send({
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      target: {
        externalUserId: message.externalUserId,
        externalChatId: message.externalChatId,
        replyContext: message.replyContext,
      },
      text,
      kind,
      externalKey: message.externalKey,
      sessionId: sessionId ?? null,
    });
  }

  /** 单条消息的完整处理链 */
  async function handleOne(cfg: ChannelRuntimeConfig, message: InboundMessage): Promise<void> {
    // 1. 幂等：平台重投直接丢弃
    const first = await messageDao.tryRecordInbound({
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      externalMessageId: message.externalMessageId,
      externalKey: message.externalKey,
      preview: maskSensitive(message.text).slice(0, 200),
    });
    if (!first) return;

    try {
      // Agent 选择：渠道显式绑定 → 平台默认 → 租户内第一个可用 Agent
      // （第三级是为了「装上就能用」：多数部署并不知道 Agent ID）
      const agentId =
        cfg.agentId ??
        deps.defaultAgentId ??
        (await deps.resolveAgentId?.({ tenantId: cfg.tenantId, userId: cfg.userId })) ??
        '';
      if (!agentId) {
        await reply(cfg, message, '平台还没有可用的 Agent，请先在 Web 端创建智能体后再试。');
        await messageDao.markInbound(cfg.id, message.externalMessageId, 'dropped', 'no-agent');
        return;
      }

      // 2. 命令优先：命令不消耗 token，即使未绑定也能用 /帮助 /绑定
      const command = parseCommand(message.text);
      const identityRow = await identity.findByExternal(cfg.id, message.externalUserId);

      if (command.kind !== 'none') {
        const binding = await sessionDao.findByKey(cfg.id, message.externalKey);
        const outcome = await runCommand(
          {
            cfg,
            command,
            identity: identityRow,
            agentId,
            externalKey: message.externalKey,
            externalUserId: message.externalUserId,
            externalChatId: message.externalChatId,
            ...(message.externalUserName ? { displayName: message.externalUserName } : {}),
            sessionId: binding?.session_id ?? null,
          },
          {
            ai: ai.sessionService,
            identity,
            links,
            stopRun: (sessionId) => {
              const controller = activeRuns.get(sessionId);
              if (!controller) return false;
              controller.abort();
              activeRuns.delete(sessionId);
              return true;
            },
            isRunning: (sessionId) => activeRuns.has(sessionId),
          },
        );
        await reply(cfg, message, outcome.reply, outcome.sessionId);
        await messageDao.markInbound(
          cfg.id,
          message.externalMessageId,
          'done',
          null,
          outcome.sessionId ?? null,
        );
        return;
      }

      // 3. 身份：未绑定 fail-closed（不进 Agent、不耗 token）
      if (!identityRow || identityRow.user_id !== cfg.userId) {
        await reply(cfg, message, bindGuide());
        await messageDao.markInbound(cfg.id, message.externalMessageId, 'dropped', 'unbound');
        return;
      }

      // 4. 会话解析（含懒校验自愈）
      const resolved = await links.resolve({
        channelId: cfg.id,
        channelType: cfg.type,
        tenantId: cfg.tenantId,
        userId: cfg.userId,
        externalKey: message.externalKey,
        agentId,
        replyContext: message.replyContext,
      });
      const sessionId = resolved.sessionId;

      // 5. 串行锁：同一会话已有运行，直接提示而不排队
      if (activeRuns.has(sessionId)) {
        await reply(cfg, message, '正在处理上一条消息，稍等我回复；发送 /停止 可中断。', sessionId);
        await messageDao.markInbound(
          cfg.id,
          message.externalMessageId,
          'dropped',
          'busy',
          sessionId,
        );
        return;
      }
      await messageDao.markInbound(
        cfg.id,
        message.externalMessageId,
        'processing',
        null,
        sessionId,
      );

      // 6. typing 提示（长任务体验的关键：用户不会以为机器人死了）
      const adapter = getAdapter(cfg.type);
      await adapter?.typing?.(cfg, message.externalUserId, true).catch(() => undefined);

      const controller = new AbortController();
      activeRuns.set(sessionId, controller);
      const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
      let content = '';
      let errorText: string | null = null;
      try {
        const toolRegistry = await ai.createToolRegistry(cfg.tenantId, cfg.userId, sessionId);
        const stream = ai.agentLoop.runStream({
          agentId,
          userId: cfg.userId,
          sessionId,
          message: message.text,
          tenantId: cfg.tenantId,
          toolRegistry,
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'content' && typeof chunk.delta === 'string') content += chunk.delta;
          if (chunk.type === 'error' && chunk.error?.message) {
            errorText = chunk.error.message;
          }
        }
      } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
      } finally {
        clearTimeout(timer);
        activeRuns.delete(sessionId);
        await adapter?.typing?.(cfg, message.externalUserId, false).catch(() => undefined);
      }

      // 7. 出站
      if (content.trim()) {
        const result = await reply(cfg, message, content, sessionId);
        if (!result.ok) {
          logger.warn(`回复已生成但发送失败（${cfg.id}）: ${result.error ?? '未知错误'}`);
        }
        // 入站这一侧的职责到「产出回复」为止：投递成败由出站记录（direction=out）体现，
        // 这里再记 failed 会让「AI 已答复」在记录列表里看起来像处理失败
        await messageDao.markInbound(cfg.id, message.externalMessageId, 'done', null, sessionId);
      } else {
        const reason = controller.signal.aborted
          ? '本轮已超时或被你中断'
          : (errorText ?? '没有生成内容');
        await reply(cfg, message, `这次没有拿到回复：${reason}`, sessionId);
        await messageDao.markInbound(
          cfg.id,
          message.externalMessageId,
          'failed',
          reason,
          sessionId,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error(`入站处理失败（${cfg.id}/${maskId(message.externalUserId)}）: ${detail}`);
      await messageDao
        .markInbound(cfg.id, message.externalMessageId, 'failed', detail.slice(0, 300))
        .catch(() => undefined);
      await reply(
        cfg,
        message,
        '处理这条消息时出错了，请稍后重试；若持续失败可在 Web 端查看渠道状态。',
      ).catch(() => undefined);
    }
  }

  /** 一批消息的处理入口（同渠道内顺序执行） */
  async function handleAll(channelId: string, messages: InboundMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const cfg = await channels.getRuntimeConfig(channelId);
    if (!cfg) return;
    // IM 消息量小，顺序处理更可预测，也避免瞬时打爆 LLM
    for (const message of messages) {
      await handleOne(cfg, message);
    }
  }

  return {
    handle: handleAll,

    async handleWebhook(channelId: string, req: Request): Promise<Response> {
      // 渠道必须存在且启用；不存在统一 404（不泄露存在性）
      const cfg = await channels.getRuntimeConfig(channelId);
      if (!cfg) return new Response('not found', { status: 404 });

      const adapter = getAdapter(cfg.type);
      if (!adapter) return new Response('channel type not supported', { status: 501 });

      // URL 验证：就地在 adapter 内应答
      if (adapter.verifyUrl && (req.method === 'GET' || req.method === 'POST')) {
        // clone 是为了：验证通过时不再消费 body；不通过时交给 parse 用原始 body
        // 注：adapter 契约里的 Request 与运行时的 Request 声明来自不同来源（bun-types / undici-types），
        // 结构一致但类型标识不同，这里显式收敛。
        const cloned = req.clone() as unknown as Request;
        try {
          const verification = await adapter.verifyUrl(cloned, cfg);
          // adapter 对非验证请求返回 400，此时继续走正常消息流程
          if (verification.status === 200) return verification;
        } catch {
          // 不是验证请求，继续
        }
      }

      if (!adapter.parse) return new Response('channel does not accept inbound', { status: 400 });

      try {
        const { messages, ack } = await adapter.parse(req, cfg);
        // 先 ACK 再处理：QQ / 企微都要求秒级响应，超时会重投
        if (messages.length > 0) {
          void handleAll(channelId, messages).catch((error) => {
            logger.error(
              `webhook 异步处理失败: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        }
        return ack ?? Response.json({ ok: true });
      } catch (error) {
        // 验签失败：401，且只记日志不写业务表
        logger.warn(
          `webhook 校验失败（${channelId}）: ${error instanceof Error ? error.message : String(error)}`,
        );
        return new Response('unauthorized', { status: 401 });
      }
    },

    stopRun(sessionId: string): boolean {
      const controller = activeRuns.get(sessionId);
      if (!controller) return false;
      controller.abort();
      activeRuns.delete(sessionId);
      return true;
    },

    isRunning(sessionId: string): boolean {
      return activeRuns.has(sessionId);
    },

    shutdown(): void {
      for (const controller of activeRuns.values()) controller.abort();
      activeRuns.clear();
    },
  };
}
