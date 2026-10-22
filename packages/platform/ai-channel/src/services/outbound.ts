/**
 * 出站：分片 → 限流 → 台账 → adapter.send
 *
 * 为什么不把每条消息都塞队列：IM 通知讲究时效，排队 30 秒再发体验更差。
 * 所以「先直发，失败且可重试才入队」，队列只承担网络抖动与限流的补偿。
 */

import type { Cache } from '@ventostack/cache';
import type { Database } from '@ventostack/database';
import { getCatalogEntry, resolveMaxMessageLength } from '../catalog';
import { createMessageDao } from '../models/message';
import type { MessageDao } from '../models/message';
import { maskSensitive, splitMessage } from '../shared/text';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  OutboundKind,
  OutboundMessage,
  SendResult,
} from '../types';

export interface SendOutboundParams {
  channelId: string;
  tenantId: string;
  /** 目标：私聊对象 / 设备 */
  target: {
    externalUserId: string;
    externalChatId: string;
    replyContext?: Record<string, unknown>;
  };
  text: string;
  kind: OutboundKind;
  externalKey?: string | null;
  sessionId?: string | null;
  /** 去重键：同一 run 的自动推送只发一次 */
  dedupKey?: string | null;
}

export interface OutboundServiceDeps {
  db: Database;
  cache?: Cache;
  loadConfig(channelId: string): Promise<ChannelRuntimeConfig | null>;
  getAdapter(type: string): ChannelAdapter | undefined;
}

export interface OutboundService {
  send(params: SendOutboundParams): Promise<SendResult>;
  /** 队列补偿扫描：runtime 每 5 秒调用 */
  flush(): Promise<number>;
  countPending(channelId: string): Promise<number>;
}

export function createOutboundService(deps: OutboundServiceDeps): OutboundService {
  const { db, cache } = deps;
  const messageDao: MessageDao = createMessageDao({ db });

  /** 出站限流：按分钟窗口计数（cache 竞态下可能略超，可接受） */
  async function allowSend(channelId: string, type: string): Promise<boolean> {
    if (!cache) return true;
    const entry = getCatalogEntry(type);
    const limit = entry?.rateLimitPerMinute ?? 30;
    const window = Math.floor(Date.now() / 60_000);
    const key = `ai:channel:rl:${channelId}:${window}`;
    try {
      const current = (await cache.get<number>(key)) ?? 0;
      if (current >= limit) return false;
      await cache.set(key, current + 1, { ttl: 70_000 });
      return true;
    } catch {
      // 缓存故障不阻断发送（限流是保护，不是硬性依赖）
      return true;
    }
  }

  /** 单片发送 + 台账 */
  async function sendChunk(
    cfg: ChannelRuntimeConfig,
    adapter: ChannelAdapter,
    msg: OutboundMessage,
  ): Promise<SendResult> {
    try {
      return await adapter.send(msg, cfg);
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    async send(params: SendOutboundParams): Promise<SendResult> {
      const cfg = await deps.loadConfig(params.channelId);
      if (!cfg) return { ok: false, retryable: false, error: '渠道不存在或未启用' };

      const adapter = deps.getAdapter(cfg.type);
      if (!adapter) return { ok: false, retryable: false, error: `渠道类型 ${cfg.type} 未实现` };

      if (!(await allowSend(cfg.id, cfg.type))) {
        // 限流：入队等窗口过去再发（缓存 TTL 70s 后自然恢复）
        await messageDao.enqueueOutbound({
          channelId: cfg.id,
          tenantId: params.tenantId,
          kind: params.kind,
          externalKey: params.externalKey ?? null,
          sessionId: params.sessionId ?? null,
          text: params.text,
          dedupKey: params.dedupKey ?? null,
        });
        return { ok: false, retryable: true, error: '发送过于频繁，已排队重试' };
      }

      // 脱敏后再分片：分片长度按渠道上限，避免切碎语义
      const masked = maskSensitive(params.text);
      const chunks = splitMessage(masked, resolveMaxMessageLength(cfg.type, cfg.config));
      if (chunks.length === 0) return { ok: false, retryable: false, error: '消息内容为空' };

      let lastMessageId: string | undefined;
      for (const [index, chunk] of chunks.entries()) {
        const result = await sendChunk(cfg, adapter, {
          channelId: cfg.id,
          target: params.target,
          text: chunk,
          kind: params.kind,
        });
        if (!result.ok) {
          await messageDao.enqueueOutbound({
            channelId: cfg.id,
            tenantId: params.tenantId,
            kind: params.kind,
            externalKey: params.externalKey ?? null,
            sessionId: params.sessionId ?? null,
            // 只重试失败的那一片及其后续（已成功的分片不能重发）
            text: chunks.slice(index).join('\n'),
            dedupKey: params.dedupKey ? `${params.dedupKey}:${index}` : null,
          });
          return result;
        }
        lastMessageId = result.messageId ?? lastMessageId;
      }

      return { ok: true, retryable: false, ...(lastMessageId ? { messageId: lastMessageId } : {}) };
    },

    async flush(): Promise<number> {
      const pending = await messageDao.claimOutbox(20);
      let sent = 0;
      for (const row of pending) {
        const cfg = await deps.loadConfig(row.channel_id);
        if (!cfg) {
          await messageDao.markFailed(row.id, '渠道已禁用或删除', false, row.attempts + 1);
          continue;
        }
        const adapter = deps.getAdapter(cfg.type);
        if (!adapter) {
          await messageDao.markFailed(row.id, '渠道类型未实现', false, row.attempts + 1);
          continue;
        }
        // external_key 即 dm:{userId} / mqtt:{deviceId}：足以还原发送目标
        const externalId = row.external_key?.replace(/^(dm|mqtt):/, '') ?? '';
        if (!externalId) {
          await messageDao.markFailed(row.id, '缺少发送目标', false, row.attempts + 1);
          continue;
        }
        const result = await sendChunk(cfg, adapter, {
          channelId: cfg.id,
          target: { externalUserId: externalId, externalChatId: externalId },
          text: row.payload ?? row.payload_preview ?? '',
          kind: (row.kind as OutboundKind) ?? 'notify',
        });
        if (result.ok) {
          await messageDao.markSent(row.id);
          sent += 1;
        } else {
          await messageDao.markFailed(
            row.id,
            result.error ?? '发送失败',
            result.retryable,
            row.attempts + 1,
          );
        }
      }
      return sent;
    },

    async countPending(channelId: string): Promise<number> {
      return messageDao.countPending(channelId);
    },
  };
}
