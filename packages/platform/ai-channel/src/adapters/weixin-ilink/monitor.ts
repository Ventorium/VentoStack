/**
 * iLink 长轮询循环
 *
 * 三种「非正常」要区别对待，否则会出现消息重放或重试风暴：
 *   1. 长轮询超时（35s 无消息）→ 正常，立即重连，**不退避**
 *   2. ret == -14（账户会话暂停 1 小时）→ 停止轮询 1 小时，置 error，不重试
 *   3. 其它网络错误 → 指数退避 2s→4s→…≤60s，连续失败置 degraded
 */

import { createTagLogger } from '@ventostack/core';
import type { ChannelRuntimeConfig, InboundMessage } from '../../types';
const logger = createTagLogger('ai-channel:weixin');

import { buildExternalKey } from '../../shared/external-key';
import type { IlinkClient } from './client';
import type { WeixinMessage } from './types';

/** 账户会话暂停时长的兜底值：官方 -14 后 1 小时内不可用 */
export const ACCOUNT_SUSPENDED_MS = 60 * 60 * 1000;

export interface PollingLoopOptions {
  cfg: ChannelRuntimeConfig;
  client: IlinkClient;
  sink: (messages: InboundMessage[]) => Promise<void>;
  /** 游标回写（必须持久化，否则重启后重放/丢消息） */
  onCursor: (cursor: string) => Promise<void>;
  onStatus: (status: { ok: boolean; detail?: string; suspendedMs?: number }) => void;
  signal: AbortSignal;
}

/** 从 iLink 消息取正文：取第一个文本项；语音有转写文本时兜底 */
function extractText(message: WeixinMessage): string {
  const items = Array.isArray(message.item_list) ? message.item_list : [];
  const textItem = items.find((item) => item.type === 1);
  if (textItem?.text_item?.text) return textItem.text_item.text;
  const voice = items.find((item) => item.type === 3);
  return voice?.voice_item?.text ?? '';
}

/**
 * 归一化：过滤回声、半截消息、群消息。
 * 只处理 message_type=1（用户）且 message_state=2（完成）的私信。
 */
export function normalizeMessages(
  cfg: ChannelRuntimeConfig,
  messages: WeixinMessage[],
): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const message of messages) {
    if (message.message_type !== 1) continue;
    if (message.message_state !== 2) continue;
    // 不做群聊：官方能力元数据只声明私信，非空即丢弃（不猜不试探）
    if (message.group_id) continue;
    const externalUserId = message.from_user_id?.trim();
    if (!externalUserId) continue;
    const text = extractText(message).trim();
    if (!text) continue;

    out.push({
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      // message_id 缺失时用 发送者+时间+长度 兜底，避免重复处理
      externalMessageId: message.message_id ?? `wx-${externalUserId}-${Date.now()}-${text.length}`,
      externalKey: buildExternalKey('weixin-ilink', externalUserId),
      externalUserId,
      externalChatId: externalUserId,
      text: text.slice(0, 8000),
      chatType: 'dm',
      // context_token 必须随消息透传到发送环节
      replyContext: message.context_token ? { contextToken: message.context_token } : {},
      receivedAt: Date.now(),
    });
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function runPollingLoop(options: PollingLoopOptions): Promise<void> {
  const { cfg, client, sink, onCursor, onStatus, signal } = options;
  const timeoutMs =
    typeof cfg.config.pollTimeoutMs === 'number' && cfg.config.pollTimeoutMs > 0
      ? cfg.config.pollTimeoutMs
      : 35_000;
  const cursorKey = 'getUpdatesBuf';
  let cursor = typeof cfg.runtimeState[cursorKey] === 'string' ? cfg.runtimeState[cursorKey] : '';
  let failures = 0;
  let suspendedUntil = 0;

  while (!signal.aborted) {
    // 账户暂停期内不轮询，等窗口过去（不重试风暴）
    if (suspendedUntil > Date.now()) {
      await sleep(Math.min(suspendedUntil - Date.now(), 60_000), signal);
      continue;
    }

    const result = await client.getUpdates(cursor, timeoutMs, signal);
    if (signal.aborted) break;

    if (result.ok && result.data) {
      failures = 0;
      const nextCursor = result.data.getUpdatesBuf;
      if (nextCursor && nextCursor !== cursor) {
        cursor = nextCursor;
        await onCursor(nextCursor);
      }
      const messages = normalizeMessages(cfg, result.data.msgs);
      if (messages.length > 0) {
        try {
          await sink(messages);
        } catch (error) {
          logger.error(`入站处理失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      onStatus({ ok: true });
      continue;
    }

    // -14：账户会话暂停 1 小时，停止轮询
    if (result.ret === -14) {
      suspendedUntil = Date.now() + ACCOUNT_SUSPENDED_MS;
      onStatus({
        ok: false,
        detail: '账户会话已暂停，约 1 小时后自动恢复；也可重新扫码',
        suspendedMs: ACCOUNT_SUSPENDED_MS,
      });
      continue;
    }

    // 长轮询超时：正常行为，立即重连不退避
    if (result.networkError) {
      failures = 0;
      continue;
    }

    failures += 1;
    const delay = Math.min(2_000 * 2 ** (failures - 1), 60_000);
    onStatus({
      ok: false,
      detail: `拉取消息失败（${result.errmsg ?? `ret=${result.ret ?? '?'}`}），${Math.round(delay / 1000)}s 后重试`,
    });
    await sleep(delay, signal);
  }
}
