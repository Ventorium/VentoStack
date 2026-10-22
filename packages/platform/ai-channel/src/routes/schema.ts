/**
 * 渠道路由的 OpenAPI Schema 定义
 *
 * 使 /api/ai/channels 与 /api/ai/conversations/:id/channel-notify 纳入 OpenAPI 契约，
 * 前端由 o2t 生成类型（apps/admin/web/src/api/schema.ts 由 o2t 生成，勿手改）。
 *
 * 可空约定与 ai-context 一致：框架用「不声明 required」表达可空
 * （类型推导为 `T | undefined`），SchemaField 无 nullable 字段，勿引入。
 */

import type { RouteSchemaConfig, SchemaField } from '@ventostack/core';

/** 渠道路由统一 OpenAPI 标签 */
export const CHANNEL_TAG = 'ai-channel';

/** 可空字符串（不声明 required → 推导为 string | undefined） */
function optStr(description: string): SchemaField {
  return { type: 'string', description };
}

/** 可空布尔 */
function optBool(description: string): SchemaField {
  return { type: 'boolean', description };
}

/** 通用信封：{ code, message, data } */
const envelope = (data: SchemaField): SchemaField => ({
  type: 'object',
  properties: {
    code: { type: 'int', description: '业务码，0 为成功' },
    message: { type: 'string', description: '提示信息' },
    data,
  },
  description: '统一响应信封',
});

/** 渠道运行状态枚举（前端状态灯） */
const STATUS_ENUM = [
  'inactive',
  'pending_login',
  'connecting',
  'active',
  'degraded',
  'error',
  'standby',
] as const;

/** 配置字段类型枚举 */
const FIELD_TYPE_ENUM = ['text', 'password', 'number', 'boolean', 'select', 'textarea'] as const;

/** 一个可配置字段（目录用） */
const channelFieldSchema: SchemaField = {
  type: 'object',
  properties: {
    key: { type: 'string', description: '字段键名' },
    label: { type: 'string', description: '字段标签' },
    type: { type: 'string', enum: FIELD_TYPE_ENUM, description: '控件类型' },
    required: optBool('是否必填'),
    placeholder: optStr('格式示例'),
    help: optStr('填写说明'),
    docsUrl: optStr('官方文档深链'),
    default: { type: 'object', description: '默认值' },
    options: {
      type: 'array',
      description: 'select 字段的候选项',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '展示文案' },
          value: { type: 'string', description: '取值' },
          hint: optStr('选中后的补充说明'),
        },
      },
    },
    min: { type: 'number', description: '数值下限' },
    max: { type: 'number', description: '数值上限' },
    readOnly: optBool('是否只读（扫码回填）'),
  },
  description: '渠道配置字段定义',
};

/** 渠道目录条目 */
export const catalogEntrySchema: SchemaField = {
  type: 'object',
  properties: {
    type: { type: 'string', description: '渠道类型标识' },
    name: { type: 'string', description: '渠道名称' },
    category: { type: 'string', enum: ['im', 'office', 'iot'], description: '分组' },
    description: { type: 'string', description: '一句话说明' },
    official: { type: 'boolean', description: '是否官方渠道' },
    transport: {
      type: 'string',
      enum: ['polling', 'long-conn', 'webhook'],
      description: '接入方式',
    },
    requiresPublicUrl: { type: 'boolean', description: '是否必须公网可达' },
    requiresLogin: { type: 'boolean', description: '是否依赖扫码登录' },
    warning: optStr('风险与限制提示'),
    docsUrl: optStr('官方文档深链'),
    setupGuide: { type: 'array', items: { type: 'string' }, description: '接入步骤' },
    setupLinks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '步骤文案里要变成链接的片段' },
          href: { type: 'string', description: '链接目标' },
        },
        description: '接入步骤内联链接',
      },
      description: '接入步骤内联链接（按 text 在步骤文案中匹配）',
    },
    configFields: { type: 'array', items: channelFieldSchema, description: '非密配置字段' },
    secretFields: { type: 'array', items: channelFieldSchema, description: '敏感字段（加密存储）' },
    defaults: { type: 'object', description: '平台默认值' },
    maxMessageLength: { type: 'int', description: '单条消息字符上限' },
  },
  description: '渠道类型目录条目',
};

/** 渠道目录响应 */
export const catalogResponseSchema = envelope({
  type: 'object',
  properties: {
    publicBaseUrl: optStr('对外可访问地址；未配置时为 null（webhook 类渠道需先配置）'),
    items: { type: 'array', items: catalogEntrySchema, description: '全部渠道类型' },
  },
  description: '渠道目录',
});

/** 渠道视图（不含凭证明文） */
export const channelSchema: SchemaField = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '渠道 ID' },
    type: { type: 'string', description: '渠道类型' },
    name: { type: 'string', description: '展示名' },
    config: { type: 'object', description: '非密配置（已脱敏回显）' },
    hasSecret: { type: 'boolean', description: '是否已配置凭证' },
    secretKeys: { type: 'array', items: { type: 'string' }, description: '已配置的凭证字段名' },
    agentId: optStr('绑定的 Agent ID，null 表示用平台默认'),
    enabled: { type: 'boolean', description: '是否启用' },
    status: { type: 'string', enum: STATUS_ENUM, description: '运行状态' },
    statusDetail: optStr('状态说明（错误原因等）'),
    webhookUrl: optStr('webhook 模式下回填给平台的回调地址'),
    requiresLogin: { type: 'boolean', description: '是否需要扫码登录' },
    requiresPublicUrl: { type: 'boolean', description: '是否需要公网地址' },
    transport: {
      type: 'string',
      enum: ['polling', 'long-conn', 'webhook'],
      description: '接入方式',
    },
    lastActiveAt: optStr('最近一次收发时间'),
    createdAt: { type: 'string', description: '创建时间' },
    updatedAt: { type: 'string', description: '更新时间' },
  },
  description: '渠道视图',
};

/** 单渠道响应 */
export const channelResponseSchema = envelope(channelSchema);

/** 渠道列表响应 */
export const channelListResponseSchema = envelope({
  type: 'object',
  properties: {
    items: { type: 'array', items: channelSchema, description: '渠道列表' },
  },
  description: '渠道列表',
});

/** 删除结果 */
export const deletedResponseSchema = envelope({
  type: 'object',
  properties: { deleted: { type: 'boolean', description: '是否已删除' } },
  description: '删除结果',
});

/** 健康状态 */
export const healthResponseSchema = envelope({
  type: 'object',
  properties: {
    status: { type: 'string', enum: STATUS_ENUM, description: '当前状态' },
    detail: optStr('状态说明'),
  },
  description: '渠道健康状态',
});

/** 测试消息结果 */
export const testResponseSchema = envelope({
  type: 'object',
  properties: { sent: { type: 'boolean', description: '是否已发出' } },
  description: '测试消息结果',
});

/** 已绑定账号（外部 id 脱敏） */
export const identitySchema: SchemaField = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '绑定记录 ID' },
    externalUserId: { type: 'string', description: '外部用户 ID（前 4 位 + ***）' },
    displayName: optStr('外部昵称'),
    verifiedAt: optStr('绑定确认时间'),
    createdAt: { type: 'string', description: '创建时间' },
  },
  description: '已绑定账号',
};

/** 绑定列表响应 */
export const identityListResponseSchema = envelope({
  type: 'object',
  properties: {
    items: { type: 'array', items: identitySchema, description: '绑定列表' },
  },
  description: '绑定列表',
});

/** 绑定码 */
export const bindCodeSchema: SchemaField = {
  type: 'object',
  properties: {
    code: { type: 'string', description: '6 位验证码（5 分钟有效、一次性）' },
    expiresAt: { type: 'string', description: '过期时间（ISO 8601）' },
    instruction: { type: 'string', description: '给用户看的操作指引' },
  },
  description: '绑定码',
};

/** 绑定码响应 */
export const bindCodeResponseSchema = envelope(bindCodeSchema);

/** 解绑结果 */
export const unbindResponseSchema = envelope({
  type: 'object',
  properties: { unbound: { type: 'boolean', description: '是否已解绑' } },
  description: '解绑结果',
});

/** 收发记录条目（只回预览） */
export const messageSchema: SchemaField = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '记录 ID' },
    // 与 ai_channel_message.direction 一致：'in' 入站 / 'out' 出站
    direction: { type: 'string', enum: ['in', 'out'], description: '方向：入站 / 出站' },
    kind: { type: 'string', enum: ['reply', 'notify', 'progress'], description: '出站种类' },
    // 取值随管线演进（queued/sent/failed/received/processing/done/dropped），不做枚举以免前后端漂移
    status: { type: 'string', description: '处理状态' },
    sessionId: optStr('关联的 AI 会话 ID'),
    preview: { type: 'string', description: '正文预览（已脱敏截断）' },
    error: optStr('失败原因'),
    attempts: { type: 'int', description: '重试次数' },
    createdAt: { type: 'string', description: '创建时间' },
  },
  description: '收发记录',
};

/** 收发记录分页响应 */
export const messageListResponseSchema = envelope({
  type: 'object',
  properties: {
    list: { type: 'array', items: messageSchema, description: '当前页记录' },
    total: { type: 'int', description: '总条数' },
    page: { type: 'int', description: '页码' },
    pageSize: { type: 'int', description: '每页数量' },
  },
  description: '收发记录分页',
});

/** 二维码 */
export const qrBeginSchema: SchemaField = {
  type: 'object',
  properties: {
    qrcode: { type: 'string', description: '二维码标识（轮询状态时回传）' },
    qrcodeContent: {
      type: 'string',
      description: '二维码要编码的内容（liteapp 落地页 URL），由前端渲染成二维码图形',
    },
    expiresIn: { type: 'int', description: '有效期秒数' },
  },
  description: '扫码登录二维码',
};

/** 二维码响应 */
export const qrBeginResponseSchema = envelope(qrBeginSchema);

/** 扫码状态 */
export const qrStatusSchema: SchemaField = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['wait', 'scaned', 'confirmed', 'expired', 'need_verifycode', 'blocked'],
      description: '扫码状态',
    },
    detail: optStr('状态说明'),
  },
  description: '扫码状态',
};

/** 扫码状态响应 */
export const qrStatusResponseSchema = envelope(qrStatusSchema);

/** 会话级渠道通知设置 */
export const notifySettingsSchema: SchemaField = {
  type: 'object',
  properties: {
    notifyEnabled: optBool('是否允许推送结果到渠道'),
    notifyChannelIds: {
      type: 'array',
      items: { type: 'string' },
      description: '指定渠道 id；空数组表示全部已启用渠道',
    },
    autoNotifyOnFinish: optBool('每轮结束是否由子智能体总结后自动推送'),
    notifiedAt: optStr('最近一次成功推送时间'),
  },
  description: '会话级渠道通知设置',
};

/** 可推送的渠道 */
const availableChannelSchema: SchemaField = {
  type: 'object',
  properties: {
    id: { type: 'string', description: '渠道 ID' },
    type: { type: 'string', description: '渠道类型' },
    name: { type: 'string', description: '渠道名称' },
    bound: { type: 'boolean', description: '是否已绑定当前用户账号' },
  },
  description: '可推送渠道',
};

/** 通知设置读取响应 */
export const notifySettingsResponseSchema = envelope({
  type: 'object',
  properties: {
    settings: notifySettingsSchema,
    available: { type: 'array', items: availableChannelSchema, description: '可用渠道' },
  },
  description: '通知设置与可用渠道',
});

/** 通知设置写入响应 */
export const notifySettingsPatchResponseSchema = envelope({
  type: 'object',
  properties: { settings: notifySettingsSchema },
  description: '更新后的通知设置',
});

/** 构造带 summary/tags 的路由 schema */
export function routeDoc(summary: string, extra?: Partial<RouteSchemaConfig>): RouteSchemaConfig {
  return {
    openapi: { summary, tags: [CHANNEL_TAG] },
    ...extra,
  };
}

/** 从 ctx.user 取归属；缺失即 fail-closed（返回 null 由调用方 401） */
export function userOf(ctx: { user?: unknown }): {
  userId: string;
  tenantId: string;
} | null {
  const user = ctx.user as { id?: string; tenantId?: string } | undefined;
  if (!user?.id || !user.tenantId) return null;
  return { userId: user.id, tenantId: user.tenantId };
}
