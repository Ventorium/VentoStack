/**
 * @ventostack/ai-channel — 个人级对话渠道
 *
 * 把 QQ / 飞书 / 企业微信 / 钉钉 / 微信 iLink / MQTT 设备接成同一个 AI 会话的
 * 另一个 I/O 入口：入站消息进到 session，出站消息回到渠道，会话结束时主动推送摘要。
 *
 * 设计要点：
 * - 渠道 = session 的 IO 端点，用 `ai_channel_session(external_key → session_id)`
 *   做反向绑定，不做「一份渠道会话 + 一份 AI 会话」的双写。
 * - 配置 UI 由 `CHANNEL_CATALOG` 目录驱动，加渠道只加目录项 + 适配器。
 * - 本包不 import @ventostack/ai，只通过 `AiServicesLike` 结构接口消费。
 */

export { createAiChannelTables } from './migrations/001_create_ai_channel_tables';

// ── 类型 ────────────────────────────────────────────────────────────────
export type {
  ChannelType,
  TransportKind,
  ChannelStatus,
  ChatKind,
  OutboundKind,
  ExternalKeyKind,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
  AdapterHooks,
  ChannelAdapter,
  QrLoginAdapter,
  AiServicesLike,
  AiSessionServiceLike,
  AiSessionViewLike,
  AiAgentLoopLike,
  AiAgentCrudLike,
  AiLlmGatewayLike,
  AiLlmMessage,
  AiToolDefinitionLike,
  AiToolRegistryLike,
  ChannelRow,
  IdentityRow,
  ChannelSessionRow,
  ChannelMessageRow,
} from './types';
export { ChannelError } from './types';

// ── 目录（配置 UI 的唯一数据源）─────────────────────────────────────────
export {
  CHANNEL_CATALOG,
  getCatalogEntry,
  isChannelType,
  requiredFields,
  defaultConfig,
  resolveMaxMessageLength,
} from './catalog';
export type { ChannelCatalogEntry, ChannelField, ChannelFieldType } from './catalog/types';

// ── 适配器 ──────────────────────────────────────────────────────────────
export { getAdapter, listAdapters, getQrLoginAdapter } from './adapters';

// ── 共享工具（测试与前端复用）───────────────────────────────────────────
export {
  maskSensitive,
  truncateText,
  splitMessage,
  stripMentions,
  shortId,
  maskId,
} from './shared/text';
export { parseCommand, helpText, unknownCommandText } from './shared/command';
export type { ChannelCommand } from './shared/command';
export {
  dmKey,
  mqttKey,
  buildExternalKey,
  parseExternalKey,
  isValidExternalKey,
  MAX_EXTERNAL_KEY_LENGTH,
} from './shared/external-key';

// ── 服务 ────────────────────────────────────────────────────────────────
export { createChannelService, catalogList } from './services/channel';
export type {
  ChannelService,
  ChannelPublic,
  ChannelScope,
  CreateChannelParams,
  UpdateChannelParams,
} from './services/channel';
export { createIdentityService, BIND_CODE_TTL_MS } from './services/identity';
export type {
  IdentityService,
  BindCodeInfo,
  BindResult,
  OutboundTarget,
} from './services/identity';
export { createSessionLinkService } from './services/session-link';
export type {
  SessionLinkService,
  ResolveSessionParams,
  ResolveSessionResult,
} from './services/session-link';
export { createOutboundService } from './services/outbound';
export type { OutboundService, SendOutboundParams, OutboundServiceDeps } from './services/outbound';
export { createInboundService } from './services/inbound';
export type { InboundService, InboundServiceDeps } from './services/inbound';
export { createChannelRuntime } from './services/runtime';
export type { ChannelRuntime, ChannelRuntimeDeps } from './services/runtime';
export { createNotifierService } from './services/notifier';
export type { NotifierService, NotifierDeps } from './services/notifier';
export { createChannelTools, hasChannelTools } from './services/tools';
export type { ChannelToolsFactory, ChannelToolsDeps } from './services/tools';
export { runCommand, bindGuide } from './services/commands';
export type { CommandContext, CommandDeps, CommandOutcome } from './services/commands';

// ── 模块装配 ────────────────────────────────────────────────────────────
export { createAiChannelModule } from './module';
export type { AiChannelModule, AiChannelModuleDeps } from './module';
