/**
 * iLink（微信 ClawBot）HTTP 客户端
 *
 * 协议来自腾讯官方插件 @tencent-weixin/openclaw-weixin 的 docs/protocol.md。
 * 关键约束（踩坑点，逐条落在代码里）：
 *   1. sendmessage 必须回传入站消息里的 context_token，用错/复用旧值会 HTTP 200
 *      但消息静默丢失——所以 token 从 replyContext 一路透传，不做全局缓存。
 *   2. getupdates 的 get_updates_buf 必须持久化，否则重启后重放或丢消息。
 *   3. ret/errcode == -14 表示账户会话暂停 1 小时，必须停轮询而不是重试。
 *   4. 长轮询超时是正常的（服务端 hold 35s），超时按空结果处理、立即重连、不退避。
 */

import type { WeixinMessage, WeixinQrStatus } from './types';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '1.0.0';
const BOT_AGENT = 'VentoStack/1.0';

/**
 * get_qrcode_status 是**长轮询**：服务端没有状态变化时会 hold 约 30 秒才回 `wait`。
 *
 * 为什么不能等满 30 秒：这个请求要穿过管理后台自己的 HTTP 链路，
 * 而前端 fetch client 的全局超时是 10 秒（`requestTimeoutMs`）。
 * 一旦服务端等 30 秒，前端会先 abort，浏览器 Network 里就是一片 cancelled，
 * UI 上还会把 abort 当成错误显示出来——本轮修复的就是这个。
 *
 * 所以这里主动把单次等待压到 6 秒：拿到「无变化」就当 wait 立即返回，
 * 前端 2 秒后继续问。状态真正变化时服务端会立即返回，所以感知延迟几乎为 0。
 */
export const QR_STATUS_TIMEOUT_MS = 6_000;

/** iLink-App-ClientVersion：0x00MMNNPP 的十进制表示（1.0.0） */
const CLIENT_VERSION_DECIMAL = String((0x00 << 24) | (1 << 16) | (0 << 8) | 0);

export interface IlinkClientOptions {
  baseUrl?: string;
  botToken: string;
  botAgent?: string;
  channelVersion?: string;
}

export interface IlinkResult<T> {
  ok: boolean;
  data?: T;
  /** 平台返回码：-14 需暂停轮询 */
  ret?: number;
  errmsg?: string;
  /** 网络层错误（超时等），此时 ret 为空 */
  networkError?: boolean;
  /**
   * 客户端主动超时（AbortError）。
   * 与「真实网络错误」区分开：长轮询场景下超时是预期行为，不应作为错误暴露给用户。
   */
  timedOut?: boolean;
}

/** 随机 uint32 的十进制字符串再 base64，用于 X-WECHAT-UIN（官方要求的弱标识） */
function randomWechatUin(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return btoa(String(buf[0] ?? 0));
}

/** `scaned_but_redirect` 返回的 redirect_host 可能不带协议，统一补 https */
function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** 基础请求头（官方要求的公共头） */
function baseHeaders(botToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    Authorization: `Bearer ${botToken}`,
    'X-WECHAT-UIN': randomWechatUin(),
    'iLink-App-Id': 'bot',
    'iLink-App-ClientVersion': CLIENT_VERSION_DECIMAL,
  };
}

function baseInfo(botAgent: string, channelVersion: string): Record<string, unknown> {
  return { channel_version: channelVersion, bot_agent: botAgent };
}

export interface IlinkClient {
  /**
   * 登录二维码。
   * 注意 `qrcodeContent` 是**二维码要编码的内容**（官方返回的是一个
   * `https://liteapp.weixin.qq.com/q/...` 落地页 URL），**不是图片**。
   * 早期实现把它直接塞进 `<img src>`，结果拿到 text/html，二维码自然显示不出来。
   */
  getQrCode(): Promise<IlinkResult<{ qrcode: string; qrcodeContent: string }>>;
  getQrCodeStatus(
    qrcode: string,
    opts?: { verifyCode?: string; timeoutMs?: number; host?: string },
  ): Promise<IlinkResult<WeixinQrStatus>>;
  /** 长轮询收消息；timeoutMs 后返回空结果（networkError=true 且 ret 为空） */
  getUpdates(
    cursor: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<IlinkResult<{ msgs: WeixinMessage[]; getUpdatesBuf: string; ret?: number }>>;
  sendText(params: {
    toUserId: string;
    contextToken: string;
    text: string;
  }): Promise<IlinkResult<{ ret?: number; errmsg?: string }>>;
  getTypingTicket(ilinkUserId: string, contextToken?: string): Promise<string | null>;
  sendTyping(ilinkUserId: string, ticket: string, status: 1 | 2): Promise<void>;
}

export function createIlinkClient(options: IlinkClientOptions): IlinkClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const botAgent = options.botAgent ?? BOT_AGENT;
  const channelVersion = options.channelVersion ?? CHANNEL_VERSION;

  /**
   * 失败结果转发：`IlinkResult<T>` 的 data 是可选字段而非可辨识联合，
   * 直接把 `IlinkResult<A>` 当 `IlinkResult<B>` 返回会因为 data 类型不兼容被拒，
   * 这里只保留失败侧字段，语义不变且类型安全。
   */
  function failure<T>(result: IlinkResult<unknown>): IlinkResult<T> {
    return {
      ok: false,
      ...(result.ret !== undefined ? { ret: result.ret } : {}),
      ...(result.errmsg !== undefined ? { errmsg: result.errmsg } : {}),
      ...(result.networkError !== undefined ? { networkError: result.networkError } : {}),
      ...(result.timedOut !== undefined ? { timedOut: result.timedOut } : {}),
    };
  }

  /** 统一 POST：网络异常归一为 networkError，避免调用方被 fetch 异常打断循环 */
  async function post<T>(
    path: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<IlinkResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: baseHeaders(options.botToken),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        return { ok: false, networkError: false, errmsg: `HTTP ${response.status}` };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, errmsg: '响应不是合法 JSON' };
      }
      const data = (parsed ?? {}) as Record<string, unknown>;
      const ret = typeof data.ret === 'number' ? data.ret : undefined;
      const errcode = typeof data.errcode === 'number' ? data.errcode : undefined;
      const code = ret ?? errcode ?? 0;
      const errmsg = typeof data.errmsg === 'string' ? data.errmsg : undefined;
      if (code !== 0) return { ok: false, ret: code, ...(errmsg ? { errmsg } : {}) };
      return { ok: true, ret: 0, data: data as T };
    } catch (error) {
      // 长轮询超时是预期行为：标记为 networkError，由调用方按空结果继续
      return {
        ok: false,
        networkError: true,
        errmsg: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function get<T>(path: string, timeoutMs = 15_000, host?: string): Promise<IlinkResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${host ?? baseUrl}${path}`, {
        headers: baseHeaders(options.botToken),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) return { ok: false, errmsg: `HTTP ${response.status}` };
      const data = JSON.parse(text) as Record<string, unknown>;
      const code = typeof data.ret === 'number' ? data.ret : 0;
      if (code !== 0) {
        const errmsg = typeof data.errmsg === 'string' ? data.errmsg : undefined;
        return { ok: false, ret: code, ...(errmsg ? { errmsg } : {}) };
      }
      return { ok: true, data: data as T };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        networkError: true,
        ...(aborted ? { timedOut: true } : {}),
        errmsg: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getQrCode() {
      const result = await post<{ qrcode?: string; qrcode_img_content?: string }>(
        '/ilink/bot/get_bot_qrcode?bot_type=3',
        { local_token_list: [] },
        15_000,
      );
      if (!result.ok) return failure(result);
      const qrcode = result.data?.qrcode;
      const content = result.data?.qrcode_img_content;
      if (!qrcode || !content) return { ok: false, errmsg: '二维码响应缺少字段' };
      return { ok: true, data: { qrcode, qrcodeContent: content } };
    },

    async getQrCodeStatus(qrcode, opts = {}) {
      const params = new URLSearchParams({ qrcode });
      if (opts.verifyCode) params.set('verify_code', opts.verifyCode);
      return get<WeixinQrStatus>(
        `/ilink/bot/get_qrcode_status?${params.toString()}`,
        opts.timeoutMs ?? QR_STATUS_TIMEOUT_MS,
        opts.host ? normalizeHost(opts.host) : undefined,
      );
    },

    async getUpdates(cursor, timeoutMs, signal) {
      const result = await post<{
        msgs?: WeixinMessage[];
        get_updates_buf?: string;
        ret?: number;
      }>(
        '/ilink/bot/getupdates',
        { get_updates_buf: cursor, base_info: baseInfo(botAgent, channelVersion) },
        // 服务端 hold 约 35s，客户端多留 10s 余量
        timeoutMs + 10_000,
        signal,
      );
      if (!result.ok) return failure(result);
      return {
        ok: true,
        data: {
          msgs: Array.isArray(result.data?.msgs) ? result.data.msgs : [],
          getUpdatesBuf: result.data?.get_updates_buf ?? cursor,
        },
      };
    },

    async sendText({ toUserId, contextToken, text }) {
      return post<{ ret?: number; errmsg?: string }>(
        '/ilink/bot/sendmessage',
        {
          msg: {
            from_user_id: '',
            to_user_id: toUserId,
            client_id: `ventostack-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            message_type: 2,
            message_state: 2,
            // 必须原样回传入站消息的 token，否则消息静默丢失
            context_token: contextToken,
            item_list: [{ type: 1, text_item: { text } }],
          },
          base_info: baseInfo(botAgent, channelVersion),
        },
        20_000,
      );
    },

    async getTypingTicket(ilinkUserId, contextToken) {
      const result = await post<{ typing_ticket?: string }>(
        '/ilink/bot/getconfig',
        {
          ilink_user_id: ilinkUserId,
          ...(contextToken ? { context_token: contextToken } : {}),
        },
        10_000,
      );
      return result.ok ? (result.data?.typing_ticket ?? null) : null;
    },

    async sendTyping(ilinkUserId, ticket, status) {
      await post(
        '/ilink/bot/sendtyping',
        { ilink_user_id: ilinkUserId, typing_ticket: ticket, status },
        10_000,
      );
    },
  };
}
