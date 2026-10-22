/**
 * 飞书自建应用 adapter（webhook 模式）
 *
 * 为什么是 webhook 而不是长连接：飞书长连接是私有 WS 帧协议，必须引官方 SDK。
 * 本包坚持「零第三方 IM SDK」，因此走标准 HTTP 回调（需要公网地址）。
 * 两种模式在飞书后台都只是「事件订阅方式」的差异，功能等价。
 *
 * 协议要点：
 *   - URL 验证：body.type === 'url_verification' → 原样回 { challenge }
 *   - 验签：X-Lark-Signature = sha256(timestamp + nonce + encryptKey + rawBody)
 *   - 加密：配置 Encrypt Key 时 body 为 { encrypt }，AES-256-CBC（key = sha256(encryptKey)）
 *   - 出站：tenant_access_token（缓存、提前 5 分钟刷新）→ POST /open-apis/im/v1/messages
 */

import { aes256CbcDecryptBuffer, safeEqual, sha256Buffer, sha256Hex } from '../crypto';
import { buildExternalKey } from '../shared/external-key';
import { stripMentions } from '../shared/text';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types';

interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function baseUrl(cfg: ChannelRuntimeConfig): string {
  return str(cfg.config.domain, 'feishu') === 'lark'
    ? 'https://open.larksuite.com'
    : 'https://open.feishu.cn';
}

/** tenant_access_token：缓存并在过期前 5 分钟刷新 */
async function getTenantToken(cfg: ChannelRuntimeConfig): Promise<string> {
  const cached = tokenCache.get(cfg.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(`${baseUrl(cfg)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: str(cfg.config.appId),
      app_secret: str(cfg.secrets.appSecret),
    }),
  });
  const data = (await response.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败：${data.msg ?? `code=${data.code ?? '?'}`}`);
  }
  const ttl = (data.expire ?? 7200) * 1000;
  tokenCache.set(cfg.id, {
    token: data.tenant_access_token,
    expiresAt: Date.now() + ttl - 5 * 60 * 1000,
  });
  return data.tenant_access_token;
}

/** 解密飞书事件体：{ encrypt: "<base64>" }，key = SHA-256(encryptKey) 的 32 字节摘要 */
function decryptBody(encryptKey: string, encryptedBase64: string): string | null {
  const key = sha256Buffer(encryptKey);
  const cipher = Buffer.from(encryptedBase64, 'base64');
  const plain = aes256CbcDecryptBuffer(key, cipher.subarray(0, 16), cipher.subarray(16));
  return plain ? plain.toString('utf8') : null;
}

interface FeishuEvent {
  type?: string;
  challenge?: string;
  encrypt?: string;
  header?: { event_type?: string; token?: string };
  event?: {
    sender?: { sender_id?: { open_id?: string }; sender_type?: string };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      mentions?: Array<{ id?: { open_id?: string }; name?: string }>;
    };
  };
}

export const feishuAdapter: ChannelAdapter = {
  type: 'feishu-app',

  async verifyUrl(req, cfg): Promise<Response> {
    const body = (await req.clone().json()) as FeishuEvent;
    if (body.type !== 'url_verification') {
      return new Response('not a url_verification request', { status: 400 });
    }
    const encryptKey = str(cfg.secrets.encryptKey);
    if (body.encrypt && encryptKey) {
      const plain = decryptBody(encryptKey, body.encrypt);
      if (!plain) return new Response('decrypt failed', { status: 400 });
      const inner = JSON.parse(plain) as FeishuEvent;
      return Response.json({ challenge: inner.challenge ?? '' });
    }
    return Response.json({ challenge: body.challenge ?? '' });
  },

  async parse(req, cfg) {
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new Error('请求体过大');

    const encryptKey = str(cfg.secrets.encryptKey);
    // 验签：飞书用 timestamp + nonce + encryptKey + rawBody 的 sha256
    const signature = req.headers.get('X-Lark-Signature') ?? '';
    const timestamp = req.headers.get('X-Lark-Request-Timestamp') ?? '';
    const nonce = req.headers.get('X-Lark-Request-Nonce') ?? '';
    if (encryptKey && signature) {
      const skew = Math.abs(Date.now() - Number(timestamp) * 1000);
      if (!Number.isFinite(skew) || skew > 5 * 60 * 1000) {
        throw new Error('请求时间戳超出允许窗口');
      }
      const expected = sha256Hex(`${timestamp}${nonce}${encryptKey}${raw}`);
      if (!safeEqual(expected, signature)) throw new Error('签名校验失败');
    }

    let body = JSON.parse(raw) as FeishuEvent;
    if (body.encrypt) {
      if (!encryptKey) throw new Error('收到加密事件但未配置 Encrypt Key');
      const plain = decryptBody(encryptKey, body.encrypt);
      if (!plain) throw new Error('事件解密失败');
      body = JSON.parse(plain) as FeishuEvent;
    }

    const eventType = body.header?.event_type;
    if (eventType !== 'im.message.receive_v1') {
      return { messages: [], ack: Response.json({ code: 0 }) };
    }

    const message = body.event?.message;
    const sender = body.event?.sender;
    // 只处理私聊：群消息会推全量，不做群聊支持
    if (!message || message.chat_type !== 'p2p') {
      return { messages: [], ack: Response.json({ code: 0 }) };
    }
    const openId = sender?.sender_id?.open_id;
    if (!openId || sender?.sender_type === 'app') {
      return { messages: [], ack: Response.json({ code: 0 }) };
    }
    if (message.message_type !== 'text') {
      return { messages: [], ack: Response.json({ code: 0 }) };
    }

    let text = '';
    try {
      const content = JSON.parse(str(message.content, '{}')) as { text?: string };
      text = str(content.text).trim();
    } catch {
      text = '';
    }
    // 私聊里也可能带 @，统一剥离
    text = stripMentions(text);
    if (!text) return { messages: [], ack: Response.json({ code: 0 }) };

    const inbound: InboundMessage = {
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      externalMessageId: str(message.message_id, `fs-${openId}-${Date.now()}`),
      externalKey: buildExternalKey('feishu-app', openId),
      externalUserId: openId,
      externalChatId: message.chat_id ?? openId,
      text: text.slice(0, 8000),
      chatType: 'dm',
      replyContext: { chatId: message.chat_id ?? openId, receiveIdType: 'open_id' },
      receivedAt: Date.now(),
    };
    return { messages: [inbound], ack: Response.json({ code: 0 }) };
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    try {
      const token = await getTenantToken(cfg);
      const response = await fetch(
        `${baseUrl(cfg)}/open-apis/im/v1/messages?receive_id_type=open_id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: msg.target.externalChatId || msg.target.externalUserId,
            msg_type: 'text',
            content: JSON.stringify({ text: msg.text }),
          }),
        },
      );
      const data = (await response.json()) as {
        code?: number;
        msg?: string;
        data?: { message_id?: string };
      };
      if (data.code !== 0) {
        // 99991663 = token 失效，下一次调用会自动刷新
        return {
          ok: false,
          retryable: data.code === 99991663 || data.code === 11232,
          error: `${data.msg ?? '发送失败'}（code=${data.code ?? '?'}）`,
        };
      }
      return {
        ok: true,
        retryable: false,
        ...(data.data?.message_id ? { messageId: data.data.message_id } : {}),
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
    // 拉一次 token 验证凭证正确性；失败会抛错让启用流程报出人话
    await getTenantToken(cfg);
    // 机器人 open_id：用于（未来）群聊 @ 判定与消息过滤
    if (cfg.config.botOpenId) return {};
    try {
      const token = await getTenantToken(cfg);
      const response = await fetch(`${baseUrl(cfg)}/open-apis/bot/v3/info`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { code?: number; bot?: { open_id?: string } };
      return data.code === 0 && data.bot?.open_id ? { botOpenId: data.bot.open_id } : {};
    } catch {
      // 拿不到 bot info 不影响收发
      return {};
    }
  },

  async health(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }> {
    try {
      await getTenantToken(cfg);
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },
};
