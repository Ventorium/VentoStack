/** QQ 官方机器人：事件回调（需公网地址） */

import type { ChannelCatalogEntry } from './types';

export const qqbot: ChannelCatalogEntry = {
  type: 'qqbot',
  name: 'QQ',
  category: 'im',
  description: 'QQ 开放平台官方机器人，回调地址填到开放平台即可私聊对话。',
  official: true,
  transport: 'webhook',
  requiresPublicUrl: true,
  requiresReplyContext: true,
  warning:
    '个人主体目前只能开通「频道」，私聊（C2C）需要企业主体并单独申请权限；主动推送还需要「主动消息」权限。若保存后收不到消息，请先确认主体资质与权限范围。',
  docsUrl: 'https://bot.q.qq.com/wiki/',
  setupGuide: [
    '打开 QQ 开放平台 → 创建机器人应用',
    '在「开发设置」复制 AppID 与 AppSecret，填入下方',
    '在「功能配置」中开启私聊（C2C）与事件订阅 C2C_MESSAGE_CREATE',
    '把下方回调地址填到「回调配置」，平台会发一次验证请求，本服务会自动应答',
    '保存并启用后，先用 QQ 私聊机器人随便发一条消息，点「绑定」拿验证码并回发 /绑定 验证码',
    '绑定后再点「发送测试消息」验证；QQ 主动消息需额外权限，未绑定/无会话上下文时发不出去',
  ],
  setupLinks: [{ text: 'QQ 开放平台', href: 'https://q.qq.com/' }],
  configFields: [
    {
      key: 'appId',
      label: 'AppID',
      type: 'text',
      required: true,
      placeholder: '102012345',
      help: 'QQ 开放平台 → 你的机器人 → 开发设置 → AppID',
      docsUrl:
        'https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html',
    },
    {
      key: 'sandbox',
      label: '沙箱环境',
      type: 'boolean',
      default: false,
      help: '调试阶段可开启沙箱；正式使用请关闭',
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
      label: 'AppSecret',
      type: 'password',
      required: true,
      placeholder: '点击「重置」后仅显示一次',
      help: 'QQ 开放平台 → 开发设置 → AppSecret（同时用于回调事件签名）',
    },
  ],
  defaults: {
    sandbox: false,
    maxMessageLength: 4500,
  },
  maxMessageLength: 4500,
  rateLimitPerMinute: 30,
  supportsEdit: false,
  supportsTyping: false,
};
