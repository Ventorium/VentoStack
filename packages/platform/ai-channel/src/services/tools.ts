/**
 * 模型可用的渠道工具：channel_list / channel_send
 *
 * 两者都是**按会话开关动态注册**的：只有会话开启了「渠道通知」才出现。
 * 如果永远注册、在 handler 里拒绝，模型会看到一个总报错的工具，白烧 token。
 *
 * channel_send 的核心不是「发一条消息」，而是第 5 步的反向绑定：
 * 把「这条外部会话」绑到「当前 AI 会话」，用户在该渠道回复时接的是同一份上下文。
 * 这是整套设计的枢纽。
 */

import { createTagLogger } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { getCatalogEntry } from '../catalog';
import { createChannelDao } from '../models/channel';
import { createChannelSessionDao } from '../models/session-link';
import { buildExternalKey } from '../shared/external-key';
import { truncateText } from '../shared/text';
import type {
  AiSessionServiceLike,
  AiToolDefinitionLike,
  AiToolRegistryLike,
  ChannelRuntimeConfig,
} from '../types';
import type { ChannelService } from './channel';
import type { IdentityService } from './identity';
import type { OutboundService } from './outbound';
import type { SessionLinkService } from './session-link';

const logger = createTagLogger('ai-channel:tools');

/** 同一轮内最多发 3 次，防模型刷屏 */
const MAX_SENDS_PER_RUN = 3;
/** 正文上限：超过就截断并提示去 Web 看完整内容 */
const MAX_SEND_CHARS = 4000;

export interface ChannelToolsDeps {
  db: Database;
  ai: AiSessionServiceLike;
  channels: ChannelService;
  identity: IdentityService;
  links: SessionLinkService;
  outbound: OutboundService;
  /** 记录通知台账（settings.channel.notifiedAt） */
  markNotified(sessionId: string, tenantId: string, userId: string): Promise<void>;
}

export type ChannelToolsFactory = (params: {
  tenantId: string;
  userId: string;
  sessionId?: string;
}) => Promise<AiToolDefinitionLike[]>;

interface ChannelNotifySettings {
  channel?: { notifyEnabled?: boolean; notifyChannelIds?: string[] };
}

export function createChannelTools(deps: ChannelToolsDeps): ChannelToolsFactory {
  const { ai, channels, identity, links, outbound } = deps;
  const channelDao = createChannelDao({ db: deps.db });
  const sessionDao = createChannelSessionDao({ db: deps.db });

  /** 读取会话开关；未开启时返回 null（工具不注册） */
  async function readNotifySetting(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<ChannelNotifySettings['channel'] | null> {
    const settings = (await ai.getSettings(sessionId, {
      tenantId,
      userId,
    })) as ChannelNotifySettings | null;
    const channel = settings?.channel;
    return channel?.notifyEnabled === true ? channel : null;
  }

  /** 解析要用的渠道：支持传 id 或 type；限定当前用户 */
  async function resolveChannel(
    ref: string,
    tenantId: string,
    userId: string,
    allowed?: string[],
  ): Promise<ChannelRuntimeConfig | null> {
    const rows = await channelDao.list(tenantId, userId);
    const enabled = rows.filter((row) => row.enabled);
    const candidates =
      allowed && allowed.length > 0 ? enabled.filter((row) => allowed.includes(row.id)) : enabled;
    const hit =
      candidates.find((row) => row.id === ref) ??
      candidates.find((row) => row.type === ref) ??
      candidates.find((row) => row.name === ref);
    if (!hit) return null;
    return channels.getRuntimeConfig(hit.id, { tenantId, userId });
  }

  return async function buildChannelTools(params): Promise<AiToolDefinitionLike[]> {
    const { tenantId, userId, sessionId } = params;
    if (!sessionId) return [];

    let setting: ChannelNotifySettings['channel'] | null = null;
    try {
      setting = await readNotifySetting(sessionId, tenantId, userId);
    } catch (error) {
      logger.warn(
        `读取会话通知开关失败（本轮不注册渠道工具）: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
    if (!setting) return [];

    const allowed = setting.notifyChannelIds ?? [];
    let sendCount = 0;

    const listTool: AiToolDefinitionLike = {
      name: 'channel_list',
      description:
        '列出当前用户已启用、可用于通知的对话渠道。需要把结果通知给用户时，先调用本工具确认有哪些渠道可用。',
      parameters: [],
      riskLevel: 'low',
      async handler(): Promise<unknown> {
        const rows = await channelDao.list(tenantId, userId);
        const identities = await identity.listByUser({ tenantId, userId });
        const boundChannelIds = new Set(identities.map((row) => row.channel_id));
        const items = rows
          .filter((row) => row.enabled)
          .map((row) => {
            const entry = getCatalogEntry(row.type);
            return {
              id: row.id,
              type: row.type,
              name: row.name,
              bound: boundChannelIds.has(row.id),
              status: row.status,
              targetHint: entry?.requiresReplyContext ? '需要用户先发过消息' : '私聊',
            };
          });
        if (items.length === 0) {
          return {
            channels: [],
            note: '当前没有已启用的渠道，请让用户先在「对话渠道」页配置并启用',
          };
        }
        return { channels: items };
      },
    };

    const sendTool: AiToolDefinitionLike = {
      name: 'channel_send',
      description:
        '把消息发送到用户的某个对话渠道（微信/QQ/飞书/钉钉/企业微信/MQTT）。' +
        '默认以当前会话作为 threadKey，用户在该渠道回复时会接续这段对话（上下文完整），' +
        '因此可以告知用户「在这里回复即可继续追问」。',
      parameters: [
        {
          name: 'channel',
          type: 'string',
          description: '渠道 id 或类型（如 qqbot / weixin-ilink）。可先用 channel_list 查看',
          required: true,
        },
        {
          name: 'message',
          type: 'string',
          description: '纯文本消息，简洁明确；超过 4000 字会被截断',
          required: true,
        },
        {
          name: 'title',
          type: 'string',
          description: '可选的消息标题，平台支持时作为首行',
          required: false,
        },
      ],
      riskLevel: 'medium',
      async handler(raw): Promise<unknown> {
        if (sendCount >= MAX_SENDS_PER_RUN) {
          return { sent: false, reason: `本轮最多发送 ${MAX_SENDS_PER_RUN} 条，已达上限` };
        }
        const ref = String(raw.channel ?? '').trim();
        const message = truncateText(String(raw.message ?? '').trim(), MAX_SEND_CHARS);
        if (!ref) return { sent: false, reason: '缺少 channel 参数' };
        if (!message) return { sent: false, reason: '缺少 message 参数' };

        const cfg = await resolveChannel(ref, tenantId, userId, allowed);
        if (!cfg) {
          return {
            sent: false,
            reason: '该渠道不存在、未启用或不在本会话允许的通知渠道内',
          };
        }

        const entry = getCatalogEntry(cfg.type);
        if (!entry) return { sent: false, reason: '渠道类型无效' };

        // 目标解析：优先用该用户在此渠道的绑定
        const target = await identity.resolveTarget(cfg.id, tenantId, userId);
        if (!target) {
          return {
            sent: false,
            reason: '该渠道尚未绑定你的账号，请先在「对话渠道」页点击「绑定我的账号」',
          };
        }

        const dmKey = buildExternalKey(cfg.type, target.externalUserId);
        // 回环检测：目标恰是当前会话所在的渠道，直接提示用户在这里说即可
        const existing = await links.findKey(cfg.id, sessionId);
        if (existing && existing.external_key === dmKey) {
          return {
            sent: false,
            reason: '当前会话就在该渠道，直接回复即可，无需再发通知',
          };
        }

        // 微信/QQ 需要入站带来的 replyContext，否则平台静默丢弃。
        // 来源：该用户此前在这个渠道发过消息 → 绑定里存着 context_token
        let replyContext: Record<string, unknown> = {};
        if (entry.requiresReplyContext) {
          const prior = await sessionDao.findByKey(cfg.id, dmKey);
          const context = prior?.reply_context;
          if (context && typeof context === 'object' && !Array.isArray(context)) {
            replyContext = context as Record<string, unknown>;
          }
          if (Object.keys(replyContext).length === 0) {
            return {
              sent: false,
              reason: '该渠道需要用户先给它发过一条消息（获取会话上下文）后才能主动推送',
            };
          }
        }

        const title = String(raw.title ?? '').trim();
        const body = title ? `${title}\n\n${message}` : message;

        const result = await outbound.send({
          channelId: cfg.id,
          tenantId,
          target: {
            externalUserId: target.externalUserId,
            externalChatId: target.externalChatId,
            replyContext,
          },
          text: body,
          kind: 'notify',
          externalKey: dmKey,
          sessionId,
        });

        if (!result.ok) {
          return { sent: false, reason: result.error ?? '发送失败' };
        }
        sendCount += 1;

        // 【枢纽】反向绑定：用户在该渠道回复时接上同一个 sessionId
        await links.bind({
          channelId: cfg.id,
          tenantId,
          userId,
          externalKey: dmKey,
          sessionId,
          origin: 'notify',
          replyContext,
        });
        await deps.markNotified(sessionId, tenantId, userId);

        return {
          sent: true,
          channel: cfg.type,
          channelName: cfg.name,
          target: '私聊',
          sessionId,
          note: '用户在该渠道回复会接续此会话，可以告知对方「回复即可继续追问」',
        };
      },
    };

    return [listTool, sendTool];
  };
}

/** 供 notifier 复用：把工具注册表里的渠道能力做一次可用性检查 */
export function hasChannelTools(registry: AiToolRegistryLike): boolean {
  return registry.get('channel_send') !== undefined;
}
