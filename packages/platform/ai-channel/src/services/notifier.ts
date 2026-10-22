/**
 * 自动推送：通知子智能体
 *
 * 用户的要求是「把 AI 最后一次完整回复做下总结发送」，不是截断原文。
 * 因此这里复用项目里已有的子智能体模式（generateSessionTitle / judgeToolCall）：
 *   llmGateway.chat + thinkingLevel:'off' + 失败回退 reasoning
 *
 * 两个开关的分工：
 *   channel_send          模型自己决定「现在、按我说的内容、发到这个渠道」
 *   autoNotifyOnFinish    系统每轮结束兜底「不管模型有没有调工具，都把结果推给你」
 *
 * 降级策略：模型未配置 / 调用失败 / 返回空 → 截断原文。
 * **通知不能因为摘要失败而丢失。**
 */

import { createTagLogger } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { getCatalogEntry } from '../catalog';
import { createChannelDao } from '../models/channel';
import { createChannelSessionDao } from '../models/session-link';
import { buildExternalKey } from '../shared/external-key';
import { truncateText } from '../shared/text';
import type { AiServicesLike, ChannelRuntimeConfig } from '../types';
import type { IdentityService } from './identity';
import type { OutboundService } from './outbound';

const logger = createTagLogger('ai-channel:notifier');

/** 同一会话每小时最多自动推送次数，避免长任务刷屏 */
const MAX_NOTIFY_PER_HOUR = 3;
const SUMMARY_MAX_CHARS = 200;

/** 从 Agent 配置里挑摘要模型：summaryModel 优先，回退首个 models */
function pickModel(agent: unknown): string | undefined {
  if (!agent || typeof agent !== 'object') return undefined;
  const record = agent as { summaryModel?: unknown; models?: unknown };
  if (typeof record.summaryModel === 'string' && record.summaryModel) return record.summaryModel;
  if (Array.isArray(record.models)) {
    const first = record.models.find((item): item is string => typeof item === 'string');
    if (first) return first;
  }
  return undefined;
}

const NOTIFY_SUMMARY_PROMPT = [
  '你是 IM 通知摘要生成器。把下面这段 AI 回复压缩成一条适合手机通知栏阅读的消息：',
  '- 不超过 200 字，纯文本，不要 Markdown 标记',
  '- 第一句给结论（成功 / 失败 / 需要你决定）',
  '- 若失败，必须写明失败在哪一步',
  '- 最后一句给用户下一步可以做什么（例如「回复即可继续追问」）',
  '- 不要客套话，不要「以下是」之类的开场',
  '只输出摘要本身。',
].join('\n');

export interface NotifierDeps {
  db: Database;
  ai: AiServicesLike;
  identity: IdentityService;
  outbound: OutboundService;
  /** 复用渠道配置读取（含解密） */
  loadConfig(
    channelId: string,
    tenantId: string,
    userId: string,
  ): Promise<ChannelRuntimeConfig | null>;
  listChannels(
    tenantId: string,
    userId: string,
  ): Promise<Array<{ id: string; type: string; name: string; enabled: boolean }>>;
}

export interface NotifierService {
  /** 一轮对话结束后由 AI 模块的 onRunFinished 钩子调用 */
  onRunFinished(params: {
    sessionId: string;
    agentId: string;
    tenantId: string;
    userId: string;
    finalContent: string;
  }): Promise<void>;
}

interface ChannelSettings {
  channel?: {
    notifyEnabled?: boolean;
    notifyChannelIds?: string[];
    autoNotifyOnFinish?: boolean;
    notifiedAt?: string;
  };
}

export function createNotifierService(deps: NotifierDeps): NotifierService {
  const { ai } = deps;
  const channelDao = createChannelDao({ db: deps.db });
  const sessionDao = createChannelSessionDao({ db: deps.db });

  /** 每小时配额：按会话维度在内存里滚动计数（单实例足够；多实例时略宽松） */
  const recentNotify = new Map<string, number[]>();

  function allowNotify(sessionId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    const hits = (recentNotify.get(sessionId) ?? []).filter((ts) => ts > windowStart);
    if (hits.length >= MAX_NOTIFY_PER_HOUR) {
      recentNotify.set(sessionId, hits);
      return false;
    }
    hits.push(now);
    recentNotify.set(sessionId, hits);
    return true;
  }

  /** 摘要：用 Agent 的 summaryModel（不新增字段），失败返回 null 由调用方降级 */
  async function summarize(params: {
    agentId: string;
    tenantId: string;
    finalContent: string;
  }): Promise<string | null> {
    const gateway = ai.llmGateway;
    if (!gateway) return null;
    try {
      const agent = await ai.agentCrud?.getById(params.agentId, params.tenantId);
      const model = pickModel(agent);
      if (!model) return null;
      const result = await gateway.chat({
        model,
        tenantId: params.tenantId,
        // 纯摘要：关思考，避免推理模型把预算耗在 reasoning 上导致 content 为空
        thinkingLevel: 'off',
        maxTokens: 512,
        messages: [
          { role: 'system', content: NOTIFY_SUMMARY_PROMPT },
          { role: 'user', content: params.finalContent.slice(0, 12_000) },
        ],
      });
      const text = (result.content || result.reasoning || '').trim();
      return text ? truncateText(text, 800) : null;
    } catch (error) {
      logger.warn(
        `通知摘要生成失败，降级为截断原文: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  return {
    async onRunFinished(params): Promise<void> {
      const { sessionId, tenantId, userId, agentId, finalContent } = params;
      if (!finalContent.trim()) return;

      const settings = (await ai.sessionService.getSettings(sessionId, {
        tenantId,
        userId,
      })) as ChannelSettings | null;
      const channel = settings?.channel;
      if (!channel?.notifyEnabled || !channel.autoNotifyOnFinish) return;
      if (!allowNotify(sessionId)) return;

      // 目标渠道：显式勾选的优先，空 = 全部已启用渠道
      const rows = await channelDao.list(tenantId, userId);
      const enabled = rows.filter((row) => row.enabled);
      const selected =
        channel.notifyChannelIds && channel.notifyChannelIds.length > 0
          ? enabled.filter((row) => channel.notifyChannelIds?.includes(row.id))
          : enabled;
      if (selected.length === 0) return;

      const summary =
        (await summarize({ agentId, tenantId, finalContent })) ??
        `${truncateText(finalContent, SUMMARY_MAX_CHARS)}…（完整内容见 Web 会话）`;

      let sentAny = false;
      for (const row of selected) {
        const entry = getCatalogEntry(row.type);
        if (!entry) continue;
        const cfg = await deps.loadConfig(row.id, tenantId, userId);
        if (!cfg) continue;

        const target = await deps.identity.resolveTarget(cfg.id, tenantId, userId);
        if (!target) continue;

        const externalKey = buildExternalKey(cfg.type, target.externalUserId);
        // 微信/QQ 必须先有入站上下文，否则平台静默丢弃
        let replyContext: Record<string, unknown> = {};
        if (entry.requiresReplyContext) {
          const prior = await sessionDao.findByKey(cfg.id, externalKey);
          const context = prior?.reply_context;
          if (context && typeof context === 'object' && !Array.isArray(context)) {
            replyContext = context as Record<string, unknown>;
          }
          if (Object.keys(replyContext).length === 0) continue;
        }

        const result = await deps.outbound.send({
          channelId: cfg.id,
          tenantId,
          target: {
            externalUserId: target.externalUserId,
            externalChatId: target.externalChatId,
            replyContext,
          },
          text: summary,
          kind: 'notify',
          externalKey,
          sessionId,
        });
        if (!result.ok) continue;

        // 反向绑定：用户在这个渠道回复时接续当前会话
        await sessionDao.upsert({
          channelId: cfg.id,
          tenantId,
          userId,
          externalKey,
          sessionId,
          agentId,
          origin: 'notify',
          replyContext,
        });
        sentAny = true;
      }

      if (sentAny) {
        await ai.sessionService
          .updateSettings(
            sessionId,
            { tenantId, userId },
            {
              channel: { notifiedAt: new Date().toISOString() },
            },
          )
          .catch(() => undefined);
      }
    },
  };
}
