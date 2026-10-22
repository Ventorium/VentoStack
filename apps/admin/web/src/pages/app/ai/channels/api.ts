/**
 * 渠道相关接口的调用层
 *
 * 组件不直接写 `client.xxx(path, ...)` 的原因：路径字面量、query 与 body 的形态
 * 在生成类型里是一份契约，集中在一层里能避免每个组件重复写 `params: { id }`，
 * 也统一了「信封已由拦截器拆过、失败返回 null」的处理方式。
 *
 * 路由类型来自 `npm run gen:sdk` 生成的 `src/api/schema.ts`（服务启动时会自动刷新），
 * 因此这里的路径与参数都由类型校验，写错路径会在 typecheck 阶段报错。
 */
import { client } from '@/api';
import type {
  BindCodeInfo,
  ChannelCatalogResponse,
  ChannelIdentity,
  ChannelItem,
  ChannelMessageItem,
  ChannelNotifySettings,
  ChannelNotifyView,
  QrBeginResult,
  QrStatus,
} from './types';

/** 新建渠道的请求体（与后端 body 契约一致） */
export interface CreateChannelBody {
  type: string;
  name?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  agentId?: string;
}

/** 更新渠道的请求体（secrets 留空表示不修改） */
export interface UpdateChannelBody {
  name?: string;
  config?: Record<string, unknown>;
  secrets?: Record<string, string>;
  agentId?: string;
}

/**
 * 统一取值：失败或无数据一律 null，交由调用方决定展示什么。
 * 错误提示由全局拦截器负责，这里不重复弹。
 */
async function pick<T>(promise: Promise<{ error?: unknown; data?: unknown }>): Promise<T | null> {
  const { error, data } = await promise;
  if (error || data === undefined || data === null) return null;
  return data as T;
}

// ---- 目录与渠道 ----

export function fetchCatalog(): Promise<ChannelCatalogResponse | null> {
  return pick<ChannelCatalogResponse>(client.get('/api/ai/channels/catalog'));
}

export function fetchChannels(): Promise<{ items: ChannelItem[] } | null> {
  return pick<{ items: ChannelItem[] }>(client.get('/api/ai/channels'));
}

export function createChannel(body: CreateChannelBody): Promise<ChannelItem | null> {
  return pick<ChannelItem>(client.post('/api/ai/channels', { body }));
}

export function updateChannel(id: string, body: UpdateChannelBody): Promise<ChannelItem | null> {
  return pick<ChannelItem>(client.patch('/api/ai/channels/:id', { params: { id }, body }));
}

export function deleteChannel(id: string): Promise<{ deleted: boolean } | null> {
  return pick<{ deleted: boolean }>(client.delete('/api/ai/channels/:id', { params: { id } }));
}

export function setChannelEnabled(id: string, enabled: boolean): Promise<ChannelItem | null> {
  return enabled
    ? pick<ChannelItem>(client.post('/api/ai/channels/:id/enable', { params: { id } }))
    : pick<ChannelItem>(client.post('/api/ai/channels/:id/disable', { params: { id } }));
}

export function sendTestMessage(id: string): Promise<{ sent: boolean } | null> {
  return pick<{ sent: boolean }>(client.post('/api/ai/channels/:id/test', { params: { id } }));
}

// ---- 绑定 ----

export function fetchIdentities(channelId: string): Promise<{ items: ChannelIdentity[] } | null> {
  return pick<{ items: ChannelIdentity[] }>(
    client.get('/api/ai/channels/:id/identities', { params: { id: channelId } }),
  );
}

export function issueBindCode(channelId: string): Promise<BindCodeInfo | null> {
  return pick<BindCodeInfo>(
    client.post('/api/ai/channels/:id/bind-code', { params: { id: channelId } }),
  );
}

export function unbindIdentity(
  channelId: string,
  identityId: string,
): Promise<{ unbound: boolean } | null> {
  return pick<{ unbound: boolean }>(
    client.delete('/api/ai/channels/:id/identities/:identityId', {
      params: { id: channelId, identityId },
    }),
  );
}

// ---- 收发记录 ----

export function fetchMessages(
  channelId: string,
  page: number,
  pageSize: number,
): Promise<{ list: ChannelMessageItem[]; total: number; page: number; pageSize: number } | null> {
  return pick(
    client.get('/api/ai/channels/:id/messages', {
      params: { id: channelId },
      query: { page, pageSize },
    }),
  );
}

// ---- 扫码登录（仅微信） ----

export function beginQrLogin(channelId: string): Promise<QrBeginResult | null> {
  return pick<QrBeginResult>(
    client.post('/api/ai/channels/:id/qr-login/begin', { params: { id: channelId } }),
  );
}

export function pollQrLogin(
  channelId: string,
  qrcode: string,
): Promise<{ status: QrStatus; detail?: string | null } | null> {
  return pick(
    client.get('/api/ai/channels/:id/qr-login/status', {
      params: { id: channelId },
      query: { qrcode },
    }),
  );
}

export function submitQrVerifyCode(
  channelId: string,
  qrcode: string,
  verifyCode: string,
): Promise<{ status: QrStatus; detail?: string | null } | null> {
  return pick(
    client.post('/api/ai/channels/:id/qr-login/verify-code', {
      params: { id: channelId },
      body: { qrcode, verifyCode },
    }),
  );
}

// ---- 会话级通知设置 ----

export function fetchNotifySettings(sessionId: string): Promise<ChannelNotifyView | null> {
  return pick<ChannelNotifyView>(
    client.get('/api/ai/conversations/:id/channel-notify', { params: { id: sessionId } }),
  );
}

export function patchNotifySettings(
  sessionId: string,
  body: ChannelNotifySettings,
): Promise<{ settings: ChannelNotifySettings | null } | null> {
  return pick<{ settings: ChannelNotifySettings | null }>(
    client.patch('/api/ai/conversations/:id/channel-notify', {
      params: { id: sessionId },
      body,
    }),
  );
}
