/** 钉钉企业内部应用：事件回调（需公网地址） */

import type { ChannelCatalogEntry } from './types';

export const dingtalkApp: ChannelCatalogEntry = {
  type: 'dingtalk-app',
  name: '钉钉',
  category: 'office',
  description: '钉钉企业内部应用机器人，用事件回调接收消息，需要在钉钉后台填回调地址。',
  official: true,
  transport: 'webhook',
  requiresPublicUrl: true,
  docsUrl: 'https://open.dingtalk.com/document/orgapp/receive-message',
  setupLinks: [{ text: '钉钉开放平台', href: 'https://open-dev.dingtalk.com/' }],
  setupGuide: [
    '打开钉钉开放平台 → 应用开发 → 企业内部应用 → 创建应用',
    '在「凭证与基础信息」复制 Client ID（AppKey）与 Client Secret（AppSecret）',
    '在「机器人」中创建机器人，消息接收模式选 HTTP 回调',
    '把下方回调地址填进去；页面会给出 aes_key，填入下方「加解密密钥」',
    '发布应用，并确保你的账号在应用可用范围内',
  ],
  configFields: [
    {
      key: 'appKey',
      label: 'Client ID（AppKey）',
      type: 'text',
      required: true,
      placeholder: 'dingxxxxxxxxxxxxxx',
      help: '钉钉开放平台 → 凭证与基础信息 → Client ID',
    },
    {
      key: 'robotCode',
      label: '机器人编码',
      type: 'text',
      help: '机器人详情页的 RobotCode；留空时用 AppKey 兜底（多数场景一致）',
    },
    {
      key: 'maxMessageLength',
      label: '单条消息上限',
      type: 'number',
      default: 4500,
      help: '超长回复会自动分片发送',
      min: 500,
      max: 5000,
    },
  ],
  secretFields: [
    {
      key: 'appSecret',
      label: 'Client Secret（AppSecret）',
      type: 'password',
      required: true,
      help: '凭证与基础信息 → Client Secret（同时用于回调验签）',
    },
    {
      key: 'encryptKey',
      label: '加解密密钥（aes_key）',
      type: 'password',
      required: true,
      placeholder: '43 位字符',
      help: '机器人「消息接收」页生成的 aes_key；留空会导致加密回调无法解密',
    },
  ],
  defaults: {
    maxMessageLength: 4500,
    stripMention: true,
  },
  maxMessageLength: 4500,
  rateLimitPerMinute: 30,
  supportsEdit: false,
  supportsTyping: false,
};
