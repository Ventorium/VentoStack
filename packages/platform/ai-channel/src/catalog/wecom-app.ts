/** 企业微信自建应用：必须公网可达，出站 20 条/分钟 */

import type { ChannelCatalogEntry } from './types';

export const wecomApp: ChannelCatalogEntry = {
  type: 'wecom-app',
  name: '企业微信',
  category: 'office',
  description: '企业微信自建应用，需要在企业微信后台配置回调地址（必须公网可达）。',
  official: true,
  transport: 'webhook',
  requiresPublicUrl: true,
  warning:
    '企业微信要求回调 URL 公网可达，且每个应用出站限 20 条/分钟（超出会排队）。自建应用不支持群聊。',
  docsUrl: 'https://developer.work.weixin.qq.com/document/path/90930',
  setupLinks: [{ text: '企业微信管理后台', href: 'https://work.weixin.qq.com/' }],
  setupGuide: [
    '打开企业微信管理后台 → 应用管理 → 自建 → 创建应用',
    '复制「企业 ID（CorpID）」与「AgentId」，以及应用详情里的 Secret',
    '在「接收消息 → 设置 API 接收」中，把下方回调 URL 填进去',
    '同一页面点「随机获取」生成 Token 与 EncodingAESKey，复制到下方',
    '保存后点「发送测试消息」验证（需先在企业微信里关注该应用）',
  ],
  configFields: [
    {
      key: 'corpId',
      label: '企业 ID（CorpID）',
      type: 'text',
      required: true,
      placeholder: 'ww1234567890abcdef',
      help: '企业微信管理后台 → 我的企业 → 企业信息 → 企业 ID',
    },
    {
      key: 'agentId',
      label: 'AgentId',
      type: 'text',
      required: true,
      placeholder: '1000002',
      help: '应用管理 → 你的应用 → AgentId（纯数字）',
    },
    {
      key: 'baseUrl',
      label: '接口地址',
      type: 'text',
      default: 'https://qyapi.weixin.qq.com',
      help: '一般不需要修改；私有化部署时可覆盖',
    },
    {
      key: 'maxMessageLength',
      label: '单条消息上限',
      type: 'number',
      default: 2000,
      help: '超长回复会自动分片发送',
      min: 200,
      max: 2048,
    },
  ],
  secretFields: [
    {
      key: 'secret',
      label: '应用 Secret',
      type: 'password',
      required: true,
      help: '应用详情页 → Secret（只显示一次，丢失需重置）',
    },
    {
      key: 'token',
      label: 'Token',
      type: 'password',
      required: true,
      help: '接收消息设置页 → Token（与回调地址配套，用于验签）',
    },
    {
      key: 'encodingAesKey',
      label: 'EncodingAESKey',
      type: 'password',
      required: true,
      placeholder: '43 位字符',
      help: '接收消息设置页 → EncodingAESKey（与 Token 同时生成，43 位）',
    },
  ],
  defaults: {
    baseUrl: 'https://qyapi.weixin.qq.com',
    maxMessageLength: 2000,
    asyncReply: true,
  },
  maxMessageLength: 2000,
  rateLimitPerMinute: 20,
  supportsEdit: false,
  supportsTyping: false,
};
