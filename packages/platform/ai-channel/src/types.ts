/**
 * @ventostack/ai-channel — 公共类型
 *
 * 设计原则：**本包不 import @ventostack/ai**。
 * AI 侧能力以「最小结构接口」声明（与 boot 对 AIModule 的处理一致），
 * 这样可选依赖语义成立、构建不会因未安装 ai 而失败，也避免包间循环依赖。
 * 真实对象由调用方注入，结构兼容即可。
 */

// ---- 渠道类型 ----

/** 渠道平台类型（全部可交互；不支持群聊，见 README） */
export type ChannelType =
  | 'weixin-ilink'
  | 'feishu-app'
  | 'qqbot'
  | 'wecom-app'
  | 'dingtalk-app'
  | 'mqtt';

/** 接入方式：长轮询 / 长连接 / webhook */
export type TransportKind = 'polling' | 'long-conn' | 'webhook';

/** 渠道运行状态（前端状态灯） */
export type ChannelStatus =
  | 'inactive'
  | 'pending_login'
  | 'connecting'
  | 'active'
  | 'degraded'
  | 'error'
  | 'standby';

/** 会话形态：私聊 / IoT 设备（不做群聊，因此没有 group） */
export type ChatKind = 'dm' | 'device';

/** 出站消息种类 */
export type OutboundKind = 'reply' | 'notify' | 'progress';

/** 外部会话标识前缀 */
export type ExternalKeyKind = 'dm' | 'mqtt';

// ---- 运行时配置 ----

/** 交给 adapter 的运行时配置（secrets 已解密） */
export interface ChannelRuntimeConfig {
  id: string;
  tenantId: string;
  userId: string;
  type: ChannelType;
  name: string;
  /** 非密配置（可回显）：appId / topicPrefix / transport … */
  config: Record<string, unknown>;
  /** 已解密凭证：appSecret / botToken … */
  secrets: Record<string, string>;
  /** 系统维护的运行态：游标、票据、缓存 */
  runtimeState: Record<string, unknown>;
  /** 该渠道默认绑定的 Agent */
  agentId?: string;
}

// ---- 入站 / 出站 ----

/** 归一化后的入站消息（adapter 的唯一产物） */
export interface InboundMessage {
  channelId: string;
  tenantId: string;
  /** 平台消息 id，幂等键 */
  externalMessageId: string;
  /** 外部会话稳定标识，见 resolveExternalKey */
  externalKey: string;
  /** 发送者外部 id（openid / userid / deviceId） */
  externalUserId: string;
  /** 回复目标会话 id（私聊 = 对方 id；MQTT = 设备 id） */
  externalChatId: string;
  externalUserName?: string;
  /** 已剥离 @ 的正文 */
  text: string;
  chatType: ChatKind;
  /** 回传用上下文（微信 context_token 等） */
  replyContext: Record<string, unknown>;
  receivedAt: number;
}

/** 出站请求 */
export interface OutboundMessage {
  channelId: string;
  target: {
    externalChatId: string;
    externalUserId: string;
    replyContext?: Record<string, unknown>;
  };
  text: string;
  kind: OutboundKind;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** 是否可重试（网络/限流 = true；参数错误/未绑定 = false） */
  retryable: boolean;
}

// ---- adapter 契约 ----

/** runtime 提供给 adapter 的回写钩子 */
export interface AdapterHooks {
  /** 持久化运行态（游标/票据）：必须落库，否则重启后重放或丢消息 */
  onRuntimeState?(patch: Record<string, unknown>): Promise<void>;
  /** 上报连接状态（状态灯） */
  onStatus?(status: { ok: boolean; detail?: string }): void;
}

export interface ChannelAdapter {
  readonly type: ChannelType;

  /**
   * 长连接/长轮询类：建立连接并持续投递消息。
   * 返回后连接由 runtime 托管（实现方需在 stop 时退出循环）。
   */
  start?(
    cfg: ChannelRuntimeConfig,
    sink: (messages: InboundMessage[]) => Promise<void>,
    hooks?: AdapterHooks,
  ): Promise<void>;

  stop?(channelId: string): Promise<void>;

  /** webhook 类：URL 验证（飞书 challenge / 企微 echostr / QQ op:13），就地应答 */
  verifyUrl?(req: Request, cfg: ChannelRuntimeConfig): Promise<Response>;

  /** webhook 类：验签 + 解密 + 归一化；验签失败必须 throw */
  parse?(
    req: Request,
    cfg: ChannelRuntimeConfig,
  ): Promise<{ messages: InboundMessage[]; ack?: Response }>;

  /** 出站 */
  send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult>;

  /** 连接期准备（拉 bot open_id、换 token 等），返回 runtimeState 增量 */
  prepare?(cfg: ChannelRuntimeConfig): Promise<Record<string, unknown>>;

  /** 运行中周期性维护（token 刷新、typing 清理） */
  tick?(cfg: ChannelRuntimeConfig): Promise<void>;

  /** 健康探活 */
  health?(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }>;

  /** 收到消息后的「正在输入」提示（可选） */
  typing?(cfg: ChannelRuntimeConfig, externalUserId: string, on: boolean): Promise<void>;

  /** 该渠道是否需要外部会话上下文（主动通知时缺它就无法发送） */
  requiresReplyContext?(cfg: ChannelRuntimeConfig): boolean;
}

/** 扫码登录类渠道（仅 weixin-ilink）额外能力 */
export interface QrLoginAdapter {
  beginLogin(cfg: ChannelRuntimeConfig): Promise<{
    qrcode: string;
    /**
     * 二维码要编码的**内容**（官方给的是 liteapp 落地页 URL，不是图片）。
     * 前端必须自己渲染成二维码图形；早期直接当 `<img src>` 用导致二维码显示不出来。
     */
    qrcodeContent: string;
    expiresIn: number;
  }>;
  pollLogin(
    cfg: ChannelRuntimeConfig,
    qrcode: string,
    verifyCode?: string,
  ): Promise<{
    status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'need_verifycode' | 'blocked';
    secrets?: Record<string, string>;
    configPatch?: Record<string, unknown>;
    detail?: string;
  }>;
}

// ---- AI 侧最小结构接口（结构兼容 @ventostack/ai） ----

export interface AiStreamChunk {
  type: string;
  delta?: string;
  error?: { code: string; message: string };
}

export interface AiAgentLoopLike {
  runStream(params: {
    agentId: string;
    userId: string;
    sessionId: string;
    message: string;
    tenantId: string;
    toolRegistry?: unknown;
    signal?: AbortSignal;
  }): AsyncIterable<AiStreamChunk>;
}

export interface AiToolParameterLike {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

/** 与 @ventostack/ai 的 ToolDefinition 结构兼容 */
export interface AiToolDefinitionLike {
  name: string;
  description: string;
  parameters: AiToolParameterLike[];
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  requiresApproval?: boolean;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
}

export interface AiToolRegistryLike {
  register(tool: AiToolDefinitionLike): void;
  get(name: string): AiToolDefinitionLike | undefined;
  list(): AiToolDefinitionLike[];
}

export interface AiSessionViewLike {
  sessionId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: string;
  messageCount: number;
  origin: { kind: string; channelId?: string; channelType?: string };
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AiSessionServiceLike {
  create(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    title?: string;
    origin?: { kind: 'web' | 'channel' | 'api'; channelId?: string; channelType?: string };
  }): Promise<{ sessionId: string }>;
  get(
    sessionId: string,
    scope: { tenantId: string; userId: string },
  ): Promise<AiSessionViewLike | null>;
  list(params: {
    tenantId: string;
    userId: string;
    agentId?: string;
    channelId?: string;
  }): Promise<AiSessionViewLike[]>;
  getSettings(
    sessionId: string,
    scope: { tenantId: string; userId: string },
  ): Promise<Record<string, unknown> | null>;
  updateSettings(
    sessionId: string,
    scope: { tenantId: string; userId: string },
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  getHistory(
    sessionId: string,
    scope: { tenantId: string; userId: string },
    limit?: number,
  ): Promise<Array<{ role: string; content: string; model?: string; reasoning?: string }>>;
}

export interface AiLlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiLlmGatewayLike {
  chat(params: {
    model: string;
    tenantId: string;
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    maxTokens?: number;
    messages: AiLlmMessage[];
  }): Promise<{ content?: string; reasoning?: string }>;
}

/** Agent 读取的最小结构（通知摘要要取 summaryModel） */
export interface AiAgentCrudLike {
  /** 返回结构由 AI 模块决定，本包只按需窄化，避免复制 AgentConfig 定义 */
  getById(id: string, tenantId: string): Promise<unknown | null>;
}

/** 渠道模块消费的 AI 能力集合，由 boot 注入 */
export interface AiServicesLike {
  sessionService: AiSessionServiceLike;
  agentLoop: AiAgentLoopLike;
  /** 请求级工具注册表工厂（渠道侧运行 Agent 复用同一套租户工具） */
  createToolRegistry(
    tenantId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<AiToolRegistryLike>;
  /** 通知摘要子智能体要用的模型网关（可选：未配置时降级为截断原文） */
  llmGateway?: AiLlmGatewayLike;
  /** 读取 Agent 的摘要模型（可选） */
  agentCrud?: AiAgentCrudLike;
}

// ---- 数据库行 ----

export interface ChannelRow {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string;
  name: string;
  config: unknown;
  secrets: string | null;
  runtime_state: unknown;
  agent_id: string | null;
  enabled: boolean;
  status: string;
  status_detail: string | null;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IdentityRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  user_id: string;
  external_user_id: string;
  external_chat_id: string | null;
  display_name: string | null;
  verified_at: Date | null;
  created_at: Date;
}

export interface ChannelSessionRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  user_id: string;
  external_key: string;
  session_id: string;
  agent_id: string | null;
  origin: string;
  reply_context: unknown;
  last_message_at: Date | null;
  created_at: Date;
}

export interface ChannelMessageRow {
  id: string;
  channel_id: string;
  tenant_id: string;
  direction: 'in' | 'out';
  kind: string;
  external_message_id: string | null;
  external_key: string | null;
  session_id: string | null;
  status: string;
  /** 完整正文（仅出站，用于失败重试） */
  payload: string | null;
  payload_preview: string | null;
  error: string | null;
  attempts: number;
  next_retry_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---- 错误 ----

export class ChannelError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
    this.status = status;
  }
}
