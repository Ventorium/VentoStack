/**
 * QQ 官方机器人 adapter（webhook 模式）
 *
 * 三条关键协议细节：
 *   1. 回调验证（op:13）：用 AppSecret 派生 Ed25519 私钥，对 event_ts + plain_token
 *      签名后原样返回 { plain_token, signature }。
 *   2. 事件推送（op:0）：验 X-Signature-Ed25519 = sign(timestamp + rawBody)，
 *      并且必须 5 秒内回 { op: 12 } ACK，否则平台会重投。
 *   3. 出站被动回复：必须带 msg_id + msg_seq；主动消息需要单独申请权限
 *      （个人主体基本拿不到），所以通知场景要如实告知用户。
 */

import { signHex, verifyHex } from '../crypto/ed25519';
import { buildExternalKey } from '../shared/external-key';
import { stripMentions } from '../shared/text';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types';

const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const API_BASE = 'https://api.sgroup.qq.com';

interface QqToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, QqToken>();

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

async function getAccessToken(cfg: ChannelRuntimeConfig): Promise<string> {
  const cached = tokenCache.get(cfg.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: str(cfg.config.appId),
      clientSecret: str(cfg.secrets.appSecret),
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number | string;
    code?: number;
    message?: string;
  };
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败：${data.message ?? `code=${data.code ?? '?'}`}`);
  }
  const ttlSeconds = Number(data.expires_in ?? 7200);
  tokenCache.set(cfg.id, {
    token: data.access_token,
    // 提前 60 秒刷新，避免临界过期
    expiresAt: Date.now() + Math.max(60, ttlSeconds - 60) * 1000,
  });
  return data.access_token;
}

/** QQ 事件体（只声明用到的字段） */
interface QqPayload {
  op?: number;
  d?: {
    id?: string;
    content?: string;
    timestamp?: string;
    author?: { id?: string; user_openid?: string; member_openid?: string };
    group_openid?: string;
    channel_id?: string;
  };
  t?: string;
  id?: string;
  plain_token?: string;
  event_ts?: string;
  s?: number;
}

export const qqbotAdapter: ChannelAdapter = {
  type: 'qqbot',

  /** op:13 回调地址验证：返回签名，平台据此确认地址归属 */
  async verifyUrl(req, cfg): Promise<Response> {
    const raw = await req.text();
    const body = JSON.parse(raw) as QqPayload;
    if (body.op !== 13 || !body.plain_token || !body.event_ts) {
      return new Response('invalid verification request', { status: 400 });
    }
    const signature = signHex(str(cfg.secrets.appSecret), `${body.event_ts}${body.plain_token}`);
    return Response.json({ plain_token: body.plain_token, signature });
  },

  async parse(req, cfg) {
    const raw = await req.text();
    const appSecret = str(cfg.secrets.appSecret);
    const signature = req.headers.get('X-Signature-Ed25519') ?? '';
    const timestamp = req.headers.get('X-Signature-Timestamp') ?? '';

    // 必须 fail-closed：入站路由是匿名的，缺签名即等于任何人拿到 channelId 就能伪造事件。
    // （op:13 地址验证走 verifyUrl，不会进到这里）
    if (!signature) throw new Error('QQ 事件缺少 X-Signature-Ed25519 头');
    const skew = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(skew) || skew > 5 * 60 * 1000) {
      throw new Error('QQ 事件时间戳超出允许窗口');
    }
    if (!verifyHex(appSecret, `${timestamp}${raw}`, signature)) {
      throw new Error('QQ 事件签名校验失败');
    }

    const body = JSON.parse(raw) as QqPayload;
    // 先 ACK：平台要求 5 秒内响应，否则重投
    const ack = Response.json({ op: 12 });

    if (body.op !== 0) return { messages: [], ack };
    // 只处理单聊：群 @ 消息不做（本版本不支持群聊）
    if (body.t !== 'C2C_MESSAGE_CREATE') return { messages: [], ack };

    const message = body.d;
    const openId = message?.author?.user_openid ?? message?.author?.member_openid;
    if (!message || !openId) return { messages: [], ack };

    const text = stripMentions(str(message.content)).trim();
    if (!text) return { messages: [], ack };

    const inbound: InboundMessage = {
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      externalMessageId: str(message.id, `qq-${openId}-${Date.now()}`),
      externalKey: buildExternalKey('qqbot', openId),
      externalUserId: openId,
      externalChatId: openId,
      text: text.slice(0, 8000),
      chatType: 'dm',
      replyContext: {
        ...(message.id ? { msgId: message.id } : {}),
        ...(body.id ? { eventId: body.id } : {}),
      },
      receivedAt: Date.now(),
    };
    return { messages: [inbound], ack };
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    const msgId = str(msg.target.replyContext?.msgId);
    if (!msgId) {
      // 主动消息需要「主动消息」权限（个人主体通常没有），如实拒绝而不是假装成功
      return {
        ok: false,
        retryable: false,
        error: 'QQ 主动消息需要单独申请权限；请先在 QQ 里给机器人发一条消息，再用被动回复通知',
      };
    }
    try {
      const token = await getAccessToken(cfg);
      const response = await fetch(
        `${API_BASE}/v2/users/${encodeURIComponent(msg.target.externalUserId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `QQBot ${token}`,
          },
          body: JSON.stringify({
            content: msg.text,
            msg_type: 0,
            msg_id: msgId,
            // 同一条 msg_id 下多条回复需要递增 msg_seq；单条场景用 1 即可
            msg_seq: 1,
          }),
        },
      );
      const data = (await response.json()) as { id?: string; code?: number; message?: string };
      if (!response.ok) {
        return {
          ok: false,
          retryable: response.status >= 500 || response.status === 429,
          error: `${data.message ?? '发送失败'}（code=${data.code ?? response.status}）`,
        };
      }
      return { ok: true, retryable: false, ...(data.id ? { messageId: data.id } : {}) };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async prepare(cfg: ChannelRuntimeConfig): Promise<Record<string, unknown>> {
    // 拉一次 token 验证 AppID/Secret 是否配对
    await getAccessToken(cfg);
    return {};
  },

  async health(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }> {
    try {
      await getAccessToken(cfg);
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  requiresReplyContext(): boolean {
    return true;
  },
};
