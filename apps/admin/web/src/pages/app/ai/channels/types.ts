/**
 * 对话渠道页面的类型
 *
 * 说明：这些类型与后端 `packages/platform/ai-channel/src/routes/schema.ts` 里的
 * OpenAPI Schema 一一对应。o2t 重新生成（`npm run gen:sdk`，需要 API 在 9320 端口运行）
 * 之后，应改为从 `OpenAPIComponents['schemas']` 取，这里是过渡实现。
 */

/** 渠道运行状态（与后端 ChannelStatus 一致） */
export type ChannelStatus =
  | 'inactive'
  | 'pending_login'
  | 'connecting'
  | 'active'
  | 'degraded'
  | 'error'
  | 'standby';

export type ChannelTransport = 'polling' | 'long-conn' | 'webhook';

export type ChannelFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea';

export interface ChannelFieldOption {
  label: string;
  value: string;
  hint?: string;
}

/** 一个可配置字段（目录驱动表单的原子单位） */
export interface ChannelCatalogField {
  key: string;
  label: string;
  type: ChannelFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  docsUrl?: string;
  default?: string | number | boolean;
  options?: ChannelFieldOption[];
  min?: number;
  max?: number;
  readOnly?: boolean;
}

/** 接入步骤里的内联链接（按 text 在步骤文案中匹配） */
export interface ChannelSetupLink {
  text: string;
  href: string;
}

/** 渠道类型目录条目 */
export interface ChannelCatalogEntry {
  type: string;
  name: string;
  category: 'im' | 'office' | 'iot';
  description: string;
  official: boolean;
  transport: ChannelTransport;
  requiresPublicUrl: boolean;
  requiresLogin: boolean;
  warning?: string | null;
  docsUrl?: string | null;
  setupGuide: string[];
  setupLinks?: ChannelSetupLink[] | null;
  configFields: ChannelCatalogField[];
  secretFields: ChannelCatalogField[];
  defaults: Record<string, unknown>;
  maxMessageLength: number;
}

/** 渠道目录响应 */
export interface ChannelCatalogResponse {
  publicBaseUrl: string | null;
  items: ChannelCatalogEntry[];
}

/** 我的渠道（不含凭证明文） */
export interface ChannelItem {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  hasSecret: boolean;
  secretKeys: string[];
  agentId: string | null;
  enabled: boolean;
  status: ChannelStatus;
  statusDetail: string | null;
  webhookUrl: string | null;
  requiresLogin: boolean;
  requiresPublicUrl: boolean;
  transport: ChannelTransport;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 已绑定账号（外部 id 已脱敏） */
export interface ChannelIdentity {
  id: string;
  externalUserId: string;
  displayName: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

/** 绑定码 */
export interface BindCodeInfo {
  code: string;
  expiresAt: string;
  instruction: string;
}

/** 收发记录（只回预览） */
export interface ChannelMessageItem {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  status: string;
  sessionId: string | null;
  preview: string;
  error: string | null;
  attempts: number;
  createdAt: string;
}

/** 扫码状态 */
export type QrStatus = 'wait' | 'scaned' | 'confirmed' | 'expired' | 'need_verifycode' | 'blocked';

export interface QrBeginResult {
  qrcode: string;
  /** 二维码要编码的内容（liteapp 落地页 URL），不是图片，需前端自己渲染 */
  qrcodeContent: string;
  expiresIn: number;
}

/** 会话级渠道通知设置 */
export interface ChannelNotifySettings {
  notifyEnabled?: boolean;
  notifyChannelIds?: string[];
  autoNotifyOnFinish?: boolean;
  notifiedAt?: string | null;
}

export interface ChannelNotifyAvailable {
  id: string;
  type: string;
  name: string;
  bound: boolean;
}

export interface ChannelNotifyView {
  settings: ChannelNotifySettings | null;
  available: ChannelNotifyAvailable[];
}

/** 状态灯：颜色 + 文案（与后端 ChannelStatus 一一对应） */
export const CHANNEL_STATUS_META: Record<ChannelStatus, { color: string; label: string }> = {
  inactive: { color: 'default', label: '未启用' },
  pending_login: { color: 'warning', label: '待扫码' },
  connecting: { color: 'processing', label: '连接中' },
  active: { color: 'success', label: '已连通' },
  degraded: { color: 'warning', label: '不稳定' },
  error: { color: 'error', label: '异常' },
  standby: { color: 'default', label: '待接管' },
};

/** 渠道类型 → 图标（@ant-design/icons 组件名由页面映射，这里只给语义分组） */
export const CATEGORY_LABEL: Record<string, string> = {
  im: '即时通讯',
  office: '办公协作',
  iot: 'IoT 设备',
};

export const TRANSPORT_LABEL: Record<ChannelTransport, string> = {
  polling: '长轮询',
  'long-conn': '长连接',
  webhook: '回调',
};
