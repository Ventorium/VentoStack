/**
 * 渠道目录的字段与条目类型
 *
 * 目录是「配置 UI 的唯一数据源」：前端按它渲染表单、帮助文案、接入步骤与默认值，
 * 后端按它做默认值填充与必填校验。新增渠道只改目录 + 一个 adapter，不动页面。
 */

import type { ChannelType, TransportKind } from '../types';

/** 配置字段类型 */
export type ChannelFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea';

export interface ChannelFieldOption {
  label: string;
  value: string;
  /** 选中后的额外说明（例如「无需公网地址」） */
  hint?: string;
}

/**
 * 一个可配置字段。
 * help / placeholder / docsUrl 三件套的目标：用户不必离开本页去猜格式。
 */
export interface ChannelField {
  key: string;
  label: string;
  type: ChannelFieldType;
  required?: boolean;
  /** 真实格式示例，例如 `cli_a1b2c3d4e5f6` */
  placeholder?: string;
  /** 一句话说明：去哪拿、什么格式、留空会怎样 */
  help?: string;
  /** 官方文档深链 */
  docsUrl?: string;
  /** 默认值（目录层默认，用户无需填写） */
  default?: string | number | boolean;
  options?: ChannelFieldOption[];
  min?: number;
  max?: number;
  /** 前端只读展示（如扫码后回填的 botId） */
  readOnly?: boolean;
}

/**
 * 接入步骤里的内联链接。
 *
 * 接入步骤几乎都是「打开 XX 开放平台 → 创建应用 → 复制密钥」这种动线，
 * 让用户自己去搜平台地址是最容易掉队的一步，所以步骤文案里的平台名要能点。
 * 用「文案匹配」而不是富文本：目录仍然只是纯数据，前端负责把命中的片段渲染成 `<a>`。
 */
export interface ChannelSetupLink {
  /** 必须原样出现在某条 setupGuide 文案里（有测试守卫，避免改名后链接静默失效） */
  text: string;
  href: string;
}

export interface ChannelCatalogEntry {
  type: ChannelType;
  name: string;
  /** 分组：即时通讯 / 办公协作 / IoT */
  category: 'im' | 'office' | 'iot';
  description: string;
  /** 是否官方渠道（非官方需在前端显示风险提示） */
  official: boolean;
  transport: TransportKind;
  /** 是否必须公网可达（决定是否展示回调地址） */
  requiresPublicUrl: boolean;
  /** 是否依赖扫码登录（决定是否展示二维码入口） */
  requiresLogin?: boolean;
  /**
   * 主动出站是否必须携带入站带来的会话上下文（微信 context_token / QQ msg_id）。
   * true 时：用户没有先发过消息就无法主动推送，UI 需给出「先发一条消息」的提示。
   */
  requiresReplyContext?: boolean;
  /** 风险与限制提示（前端 Alert） */
  warning?: string;
  /** 编号接入步骤（表单顶部折叠面板） */
  setupGuide: string[];
  /** 接入步骤里的可点击平台名（见 ChannelSetupLink） */
  setupLinks?: ChannelSetupLink[];
  docsUrl?: string;
  /** 非密配置字段 */
  configFields: ChannelField[];
  /** 敏感字段（加密存储、只回显 hasSecret） */
  secretFields: ChannelField[];
  /** 平台默认值（用户不必填） */
  defaults: Record<string, unknown>;
  /** 单条消息上限（出站自动分片） */
  maxMessageLength: number;
  /** 出站限流（条/分钟） */
  rateLimitPerMinute: number;
  /** 是否支持编辑已发消息（决定流式增量更新是否可能） */
  supportsEdit: boolean;
  /** 是否支持「正在输入」 */
  supportsTyping: boolean;
}
