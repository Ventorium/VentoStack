/**
 * 钉钉企业内部应用 adapter（webhook 模式）
 *
 * 钉钉回调的加解密与企微同源（AES-256-CBC + random(16) + msgLen(4) + msg + corpId），
 * 差别在验签：sign = base64(HmacSHA256(timestamp + "\n" + appSecret))，放在 header。
 *
 * 出站走 v1.0 机器人接口：先换 accessToken，再按 userId 批量发送。
 */

import { aes256CbcDecryptBuffer, hmacSha256Base64, safeEqual } from '../crypto';
import { buildExternalKey } from '../shared/external-key';
import { stripMentions } from '../shared/text';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types';

const API_BASE = 'https://api.dingtalk.com';

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** 钉钉回调解密：aes_key 为 43 位，补一个 = 得到 32 字节 */
function decryptCallback(aesKey: string, encryptedBase64: string): string | null {
  const key = Buffer.from(`${aesKey}=`, 'base64');
  if (key.length !== 32) return null;
  const cipher = Buffer.from(encryptedBase64, 'base64');
  const plain = aes256CbcDecryptBuffer(key, key.subarray(0, 16), cipher.subarray(16));
  if (!plain || plain.length < 20) return null;
  const msgLen = plain.readUInt32BE(16);
  if (msgLen <= 0 || 20 + msgLen > plain.length) return null;
  return plain.subarray(20, 20 + msgLen).toString('utf8');
}

async function getAccessToken(cfg: ChannelRuntimeConfig): Promise<string> {
  const cached = tokenCache.get(cfg.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(`${API_BASE}/v1.0/oauth2/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appKey: str(cfg.config.appKey),
      appSecret: str(cfg.secrets.appSecret),
    }),
  });
  const data = (await response.json()) as {
    accessToken?: string;
    expireIn?: number;
    code?: string;
    message?: string;
  };
  if (!data.accessToken) {
    throw new Error(`获取钉钉 accessToken 失败：${data.message ?? data.code ?? '未知错误'}`);
  }
  tokenCache.set(cfg.id, {
    token: data.accessToken,
    expiresAt: Date.now() + ((data.expireIn ?? 7200) - 300) * 1000,
  });
  return data.accessToken;
}

interface DingtalkEvent {
  encrypt?: string;
  msgtype?: string;
  text?: { content?: string };
  msgId?: string;
  senderStaffId?: string;
  senderNick?: string;
  conversationId?: string;
  conversationType?: string;
  chatbotCorpId?: string;
}

export const dingtalkAdapter: ChannelAdapter = {
  type: 'dingtalk-app',

  async parse(req, cfg) {
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new Error('请求体过大');

    // 验签：sign = base64(HmacSHA256(key=appSecret, msg=timestamp + "\n" + appSecret))
    // 必须 fail-closed：入站路由是匿名的，缺签名即等于任何人拿到 channelId 就能伪造消息
    const timestamp = req.headers.get('timestamp') ?? '';
    const signature = req.headers.get('sign') ?? '';
    if (!signature) throw new Error('钉钉回调缺少 sign 头');
    const skew = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(skew) || skew > 5 * 60 * 1000) {
      throw new Error('钉钉回调时间戳超出允许窗口');
    }
    const expected = hmacSha256Base64(
      str(cfg.secrets.appSecret),
      `${timestamp}\n${str(cfg.secrets.appSecret)}`,
    );
    if (!safeEqual(expected, signature)) throw new Error('钉钉回调签名校验失败');

    const body = JSON.parse(raw) as DingtalkEvent;
    let event = body;
    if (body.encrypt) {
      const aesKey = str(cfg.secrets.encryptKey);
      if (!aesKey) throw new Error('收到加密回调但未配置加解密密钥（aes_key）');
      const plain = decryptCallback(aesKey, body.encrypt);
      if (!plain) throw new Error('钉钉回调解密失败');
      event = JSON.parse(plain) as DingtalkEvent;
    }

    const ack = Response.json({ msgtype: 'empty' });
    if (event.msgtype !== 'text') return { messages: [], ack };

    const staffId = event.senderStaffId;
    if (!staffId) return { messages: [], ack };

    // 群消息（conversationType=2）不做：本版本不支持群聊
    if (event.conversationType === '2') return { messages: [], ack };

    const text = stripMentions(str(event.text?.content)).trim();
    if (!text) return { messages: [], ack };

    const inbound: InboundMessage = {
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      externalMessageId: str(event.msgId, `dd-${staffId}-${Date.now()}`),
      externalKey: buildExternalKey('dingtalk-app', staffId),
      externalUserId: staffId,
      externalChatId: event.conversationId ?? staffId,
      ...(event.senderNick ? { externalUserName: event.senderNick } : {}),
      text: text.slice(0, 8000),
      chatType: 'dm',
      replyContext: { conversationId: event.conversationId ?? staffId },
      receivedAt: Date.now(),
    };
    return { messages: [inbound], ack };
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    try {
      const token = await getAccessToken(cfg);
      const robotCode = str(cfg.config.robotCode) || str(cfg.config.appKey);
      const response = await fetch(`${API_BASE}/v1.0/robot/oToMessages/batchSend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token,
        },
        body: JSON.stringify({
          robotCode,
          userIds: [msg.target.externalUserId],
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content: msg.text }),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          retryable: response.status >= 500 || response.status === 429,
          error: `钉钉发送失败（HTTP ${response.status}）：${text.slice(0, 200)}`,
        };
      }
      const data = (await response.json()) as { processQueryKey?: string };
      return {
        ok: true,
        retryable: false,
        ...(data.processQueryKey ? { messageId: data.processQueryKey } : {}),
      };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  async prepare(cfg: ChannelRuntimeConfig): Promise<Record<string, unknown>> {
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
};
