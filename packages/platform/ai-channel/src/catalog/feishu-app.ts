/** 飞书自建应用：走标准事件回调（需公网地址） */

import type { ChannelCatalogEntry } from './types';

export const feishuApp: ChannelCatalogEntry = {
  type: 'feishu-app',
  name: '飞书',
  category: 'office',
  description: '自建应用机器人，用的事件订阅回调，填 AppID/Secret + 把回调地址贴到飞书后台即可。',
  official: true,
  transport: 'webhook',
  requiresPublicUrl: true,
  docsUrl: 'https://open.feishu.cn/document/home/introduction-to-custom-app-development',
  setupLinks: [{ text: '飞书开放平台', href: 'https://open.feishu.cn/app' }],
  setupGuide: [
    '打开飞书开放平台 → 创建「企业自建应用」',
    '在「凭证与基础信息」复制 App ID 与 App Secret，填入下方',
    '在「添加应用能力」中启用「机器人」',
    '在「权限管理」开通 im:message 与 im:message:send_as_bot',
    '在「事件与回调 → 事件订阅」中，把下方回调地址填进去并添加事件 im.message.receive_v1',
    '飞书会发一次 URL 校验请求，本服务会自动应答，看到「验证成功」即可',
  ],
  configFields: [
    {
      key: 'appId',
      label: 'App ID',
      type: 'text',
      required: true,
      placeholder: 'cli_a1b2c3d4e5f6g7h8',
      help: '飞书开放平台 → 你的应用 → 凭证与基础信息 → App ID',
      docsUrl:
        'https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal',
    },
    {
      key: 'domain',
      label: '服务域名',
      type: 'select',
      default: 'feishu',
      help: '国内飞书选 feishu；Lark（海外）选 lark',
      options: [
        { label: '飞书（open.feishu.cn）', value: 'feishu' },
        { label: 'Lark（open.larksuite.com）', value: 'lark' },
      ],
    },
    {
      key: 'botOpenId',
      label: '机器人 Open ID',
      type: 'text',
      readOnly: true,
      help: '保存后自动拉取；每次收到消息时也用于识别发送者身份',
    },
    {
      key: 'maxMessageLength',
      label: '单条消息上限',
      type: 'number',
      default: 30000,
      help: '超长回复会自动分片发送',
      min: 500,
      max: 30000,
    },
  ],
  secretFields: [
    {
      key: 'appSecret',
      label: 'App Secret',
      type: 'password',
      required: true,
      placeholder: 'a1b2c3d4e5f6...',
      help: '飞书开放平台 → 凭证与基础信息 → App Secret（只显示一次，注意保存）',
    },
    {
      key: 'encryptKey',
      label: 'Encrypt Key',
      type: 'password',
      help: '仅 webhook 模式需要：事件订阅页的「加密密钥」，用于校验与解密推送',
    },
    {
      key: 'verificationToken',
      label: 'Verification Token',
      type: 'password',
      help: '仅 webhook 模式需要：事件订阅页的「Verification Token」',
    },
  ],
  defaults: {
    domain: 'feishu',
    streamingReply: false,
    maxMessageLength: 30000,
  },
  maxMessageLength: 30000,
  rateLimitPerMinute: 60,
  supportsEdit: true,
  supportsTyping: false,
};
