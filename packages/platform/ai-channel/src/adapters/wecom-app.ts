/**
 * 企业微信自建应用 adapter（webhook 模式）
 *
 * 微信系的两条硬约束：
 *   1. 被动回复窗口只有 5 秒，超时平台会重投 3 次。所以 parse 先回 `success`，
 *      真正的回复用「应用消息」接口异步补发。
 *   2. 每应用出站限 20 条/分钟，必须靠 outbound 的令牌桶兜住。
 *
 * 验签：msg_signature = sha1(sort([token, timestamp, nonce, encrypt]).join(''))
 * 解密：AES-256-CBC（WXBizMsgCrypt），明文 = random(16) + msgLen(4) + msg + receiveId
 */

import { aes256CbcDecryptBuffer, safeEqual, sha1Hex } from '../crypto';
import { buildExternalKey } from '../shared/external-key';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types';

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function baseUrl(cfg: ChannelRuntimeConfig): string {
  return str(cfg.config.baseUrl, 'https://qyapi.weixin.qq.com').replace(/\/$/, '');
}

/** 企微 XML 取值：兼容 CDATA 与纯文本 */
function xmlValue(xml: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  if (cdata?.[1] !== undefined) return cdata[1];
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return plain?.[1] ?? '';
}

/** 验签：token/timestamp/nonce/encrypt 字典序排序后 sha1 */
function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  signature: string,
): boolean {
  const expected = sha1Hex([token, timestamp, nonce, encrypt].sort().join(''));
  return safeEqual(expected, signature);
}

/** 解密：返回 { message, receiveId }；receiveId 必须等于 corpId，否则是伪造 */
function decrypt(
  encodingAesKey: string,
  encrypted: string,
): { message: string; receiveId: string } | null {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) return null;
  const plain = aes256CbcDecryptBuffer(key, key.subarray(0, 16), Buffer.from(encrypted, 'base64'));
  if (!plain || plain.length < 20) return null;
  const msgLen = plain.readUInt32BE(16);
  if (msgLen <= 0 || 20 + msgLen > plain.length) return null;
  return {
    message: plain.subarray(20, 20 + msgLen).toString('utf8'),
    receiveId: plain.subarray(20 + msgLen).toString('utf8'),
  };
}

async function getAccessToken(cfg: ChannelRuntimeConfig): Promise<string> {
  const cached = tokenCache.get(cfg.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const url = `${baseUrl(cfg)}/cgi-bin/gettoken?corpid=${encodeURIComponent(
    str(cfg.config.corpId),
  )}&corpsecret=${encodeURIComponent(str(cfg.secrets.secret))}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    errcode?: number;
    errmsg?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`获取 access_token 失败：${data.errmsg ?? `errcode=${data.errcode ?? '?'}`}`);
  }
  tokenCache.set(cfg.id, {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 7200) - 300) * 1000,
  });
  return data.access_token;
}

/** 平台错误码翻译：用户看得懂比错误码本身更重要 */
function translateError(code: number | undefined, message: string): string {
  switch (code) {
    case 40001:
      return 'Secret 不正确或已被重置';
    case 40013:
      return 'CorpID 不正确';
    case 40056:
      return 'AgentId 不正确';
    case 45009:
      return '接口调用超过限制（20 条/分钟）';
    case 60020:
      return '调用方 IP 不在企业可信 IP 列表内';
    case 81013:
      return '对方不在应用可见范围内';
    default:
      return `${message}（errcode=${code ?? '?'}）`;
  }
}

export const wecomAdapter: ChannelAdapter = {
  type: 'wecom-app',

  /** GET 验证：验签 + 解密 echostr 后返回明文 */
  async verifyUrl(req, cfg): Promise<Response> {
    const url = new URL(req.url);
    const signature = url.searchParams.get('msg_signature') ?? '';
    const timestamp = url.searchParams.get('timestamp') ?? '';
    const nonce = url.searchParams.get('nonce') ?? '';
    const echostr = url.searchParams.get('echostr') ?? '';

    if (!signature || !echostr) return new Response('missing parameters', { status: 400 });
    if (!verifySignature(str(cfg.secrets.token), timestamp, nonce, echostr, signature)) {
      return new Response('signature mismatch', { status: 401 });
    }
    const decrypted = decrypt(str(cfg.secrets.encodingAesKey), echostr);
    if (!decrypted) return new Response('decrypt failed', { status: 400 });
    return new Response(decrypted.message, { status: 200 });
  },

  async parse(req, cfg) {
    const url = new URL(req.url);
    const signature = url.searchParams.get('msg_signature') ?? '';
    const timestamp = url.searchParams.get('timestamp') ?? '';
    const nonce = url.searchParams.get('nonce') ?? '';
    const raw = await req.text();
    if (raw.length > 1_000_000) throw new Error('请求体过大');

    const encrypt = xmlValue(raw, 'Encrypt');
    if (!encrypt) throw new Error('缺少 Encrypt 字段');
    if (!verifySignature(str(cfg.secrets.token), timestamp, nonce, encrypt, signature)) {
      throw new Error('企微消息签名校验失败');
    }
    const decrypted = decrypt(str(cfg.secrets.encodingAesKey), encrypt);
    if (!decrypted) throw new Error('企微消息解密失败');
    // receiveId 必须等于 corpId：否则是别的企业的消息被转发过来
    if (decrypted.receiveId !== str(cfg.config.corpId)) {
      throw new Error('企微消息 receiveId 与 CorpID 不匹配');
    }

    const xml = decrypted.message;
    const fromUser = xmlValue(xml, 'FromUserName');
    const msgType = xmlValue(xml, 'MsgType');
    const content = xmlValue(xml, 'Content');
    const msgId = xmlValue(xml, 'MsgId');

    // 5 秒窗口：先 ACK 再处理（ack 由路由层先返回，管线在后台跑）
    const ack = new Response('success', { status: 200 });
    if (msgType !== 'text' || !fromUser || !content.trim()) {
      return { messages: [], ack };
    }

    const inbound: InboundMessage = {
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      externalMessageId: msgId || `wecom-${fromUser}-${Date.now()}`,
      externalKey: buildExternalKey('wecom-app', fromUser),
      externalUserId: fromUser,
      externalChatId: fromUser,
      text: content.trim().slice(0, 8000),
      chatType: 'dm',
      replyContext: {},
      receivedAt: Date.now(),
    };
    return { messages: [inbound], ack };
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    try {
      const token = await getAccessToken(cfg);
      const agentId = Number(str(cfg.config.agentId, '0'));
      const response = await fetch(`${baseUrl(cfg)}/cgi-bin/message/send?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: msg.target.externalUserId,
          msgtype: 'text',
          agentid: Number.isFinite(agentId) ? agentId : 0,
          text: { content: msg.text },
          safe: 0,
        }),
      });
      const data = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
        msgid?: string;
      };
      if (data.errcode !== 0) {
        return {
          ok: false,
          // 45009 限流可重试；其余（凭证/可见范围）重试无意义
          retryable: data.errcode === 45009 || data.errcode === -1,
          error: translateError(data.errcode, data.errmsg ?? '发送失败'),
        };
      }
      return { ok: true, retryable: false, ...(data.msgid ? { messageId: data.msgid } : {}) };
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
