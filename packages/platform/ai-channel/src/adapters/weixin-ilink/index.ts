/**
 * 微信（ClawBot / iLink）adapter
 *
 * 腾讯官方渠道：扫码登录 + 35 秒长轮询，无需公网。
 * 只支持私信（官方能力元数据未声明群聊），文本消息。
 */

import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  QrLoginAdapter,
  SendResult,
} from '../../types';
import { QR_STATUS_TIMEOUT_MS, createIlinkClient } from './client';
import type { IlinkClient } from './client';
import { runPollingLoop } from './monitor';
import type { WeixinQrStatus } from './types';

interface Connection {
  client: IlinkClient;
  controller: AbortController;
  status: { ok: boolean; detail?: string };
}

const connections = new Map<string, Connection>();

/** 单次状态查询最多跟几跳 redirect_host */
const MAX_REDIRECT_HOPS = 2;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function createClient(cfg: ChannelRuntimeConfig): IlinkClient {
  return createIlinkClient({
    baseUrl: str(cfg.config.baseUrl, 'https://ilinkai.weixin.qq.com'),
    botToken: str(cfg.secrets.botToken),
    botAgent: str(cfg.config.botAgent, 'VentoStack/1.0'),
  });
}

/** 二维码登录：与运行时无关，用「未登录」客户端调官方接口 */
const qrLogin: QrLoginAdapter = {
  async beginLogin(cfg) {
    const client = createClient(cfg);
    const result = await client.getQrCode();
    if (!result.ok || !result.data) {
      throw new Error(`获取二维码失败：${result.errmsg ?? `ret=${result.ret ?? '?'}`}`);
    }
    return {
      qrcode: result.data.qrcode,
      // 这是二维码要编码的内容（liteapp 落地页 URL），由前端渲染成二维码图形
      qrcodeContent: result.data.qrcodeContent,
      expiresIn: 120,
    };
  },

  async pollLogin(cfg, qrcode, verifyCode) {
    const client = createClient(cfg);
    // 单次状态查询的等待上限：必须小于前端 fetch client 的 10s 全局超时
    const budget =
      typeof cfg.config.qrStatusTimeoutMs === 'number' && cfg.config.qrStatusTimeoutMs > 0
        ? cfg.config.qrStatusTimeoutMs
        : QR_STATUS_TIMEOUT_MS;
    const deadline = Date.now() + budget;
    let host: string | undefined;

    // 官方的 scaned_but_redirect 会把会话迁到 redirect_host，不跟着走就会一直停在「已扫码」
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
      const remaining = deadline - Date.now();
      // 预算用完就交还控制权；阈值取小值，避免把小预算（测试/慢网调优）直接判死
      if (remaining < 50) return { status: 'wait' };

      const result = await client.getQrCodeStatus(qrcode, {
        ...(verifyCode ? { verifyCode } : {}),
        timeoutMs: remaining,
        ...(host ? { host } : {}),
      });

      // 长轮询窗口内没有状态变化：属于正常情况，静默当作 wait，不要把超时当错误抛给前端
      if (result.timedOut) return { status: 'wait' };
      if (!result.ok || !result.data) {
        return { status: 'wait', ...(result.errmsg ? { detail: result.errmsg } : {}) };
      }

      const data = result.data;
      if (data.status === 'scaned_but_redirect' && data.redirect_host) {
        host = data.redirect_host;
        continue;
      }
      return mapQrStatus(data);
    }

    // 连续重定向仍未确认：已扫码，继续轮询即可
    return { status: 'scaned' };
  },
};

/** 官方状态字段 → 对外状态机 */
function mapQrStatus(data: WeixinQrStatus): {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'need_verifycode' | 'blocked';
  secrets?: Record<string, string>;
  configPatch?: Record<string, unknown>;
  detail?: string;
} {
  if (data.status === 'confirmed') {
    const secrets: Record<string, string> = {};
    if (data.bot_token) secrets.botToken = data.bot_token;
    const configPatch: Record<string, unknown> = {};
    if (data.ilink_bot_id) configPatch.ilinkBotId = data.ilink_bot_id;
    if (data.baseurl) configPatch.baseUrl = data.baseurl;
    return { status: 'confirmed', secrets, configPatch };
  }
  if (data.status === 'need_verifycode') return { status: 'need_verifycode' };
  if (data.status === 'verify_code_blocked' || data.verify_code_blocked) {
    return { status: 'blocked', detail: '验证码错误次数过多，请刷新二维码后重试' };
  }
  if (data.status === 'expired') return { status: 'expired' };
  if (data.status === 'scaned' || data.status === 'scaned_but_redirect') {
    return { status: 'scaned' };
  }
  return { status: 'wait' };
}

export const weixinIlinkAdapter: ChannelAdapter & QrLoginAdapter = {
  type: 'weixin-ilink',
  beginLogin: qrLogin.beginLogin,
  pollLogin: qrLogin.pollLogin,

  async start(cfg, sink, hooks): Promise<void> {
    const botToken = str(cfg.secrets.botToken);
    if (!botToken) throw new Error('尚未扫码登录，请先完成扫码');

    // 重复 start 先停旧连接，避免同一账号双轮询导致消息分裂
    const existing = connections.get(cfg.id);
    if (existing) {
      existing.controller.abort();
      connections.delete(cfg.id);
    }

    const client = createClient(cfg);
    const controller = new AbortController();
    const connection: Connection = { client, controller, status: { ok: true } };
    connections.set(cfg.id, connection);

    // 不 await：长轮询是常驻循环，start 只负责拉起
    void runPollingLoop({
      cfg,
      client,
      sink: (messages: InboundMessage[]) => sink(messages),
      onCursor: async (cursor) => {
        // 游标必须落库：进程重启后从断点继续，避免重放
        cfg.runtimeState.getUpdatesBuf = cursor;
        await hooks?.onRuntimeState?.({ getUpdatesBuf: cursor });
      },
      onStatus: (status) => {
        connection.status = status;
        hooks?.onStatus?.({ ok: status.ok, ...(status.detail ? { detail: status.detail } : {}) });
      },
      signal: controller.signal,
    }).catch((error) => {
      connection.status = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    });
  },

  async stop(channelId): Promise<void> {
    const connection = connections.get(channelId);
    if (!connection) return;
    connection.controller.abort();
    connections.delete(channelId);
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    const connection = connections.get(cfg.id);
    const client = connection?.client ?? createClient(cfg);
    const contextToken = str(
      msg.target.replyContext?.contextToken ?? msg.target.replyContext?.context_token,
    );
    if (!contextToken) {
      // 没有入站 context_token 就无法发送（官方行为：静默丢弃）
      return {
        ok: false,
        retryable: false,
        error: '缺少会话上下文（context_token）：请先在微信里给机器人发一条消息',
      };
    }
    const result = await client.sendText({
      toUserId: msg.target.externalChatId,
      contextToken,
      text: msg.text,
    });
    if (!result.ok) {
      return {
        ok: false,
        retryable: result.networkError === true || result.ret !== -14,
        error: result.errmsg ?? `ret=${result.ret ?? '?'}`,
      };
    }
    return { ok: true, retryable: false };
  },

  async typing(cfg, externalUserId, on): Promise<void> {
    const connection = connections.get(cfg.id);
    if (!connection) return;
    const ticket = await connection.client.getTypingTicket(externalUserId);
    if (!ticket) return;
    await connection.client.sendTyping(externalUserId, ticket, on ? 1 : 2).catch(() => {
      // typing 是体验增强，失败不影响主流程
    });
  },

  async health(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }> {
    const connection = connections.get(cfg.id);
    if (!connection) return { ok: false, detail: '未建立连接' };
    return connection.status.ok
      ? { ok: true }
      : { ok: false, detail: connection.status.detail ?? '连接异常' };
  },

  /** 主动通知必须带 context_token，因此要求先有一次入站 */
  requiresReplyContext(): boolean {
    return true;
  },
};
