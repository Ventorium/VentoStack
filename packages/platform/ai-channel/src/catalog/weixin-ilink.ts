/** 微信（ClawBot / iLink）：腾讯官方渠道，扫码登录 + 35 秒长轮询，无需公网 */

import type { ChannelCatalogEntry } from './types';

export const weixinIlink: ChannelCatalogEntry = {
  type: 'weixin-ilink',
  name: '微信',
  category: 'im',
  description: '通过腾讯官方 ClawBot（iLink）接入，扫码即可用，不需要公网地址。',
  official: true,
  transport: 'polling',
  requiresPublicUrl: false,
  requiresLogin: true,
  requiresReplyContext: true,
  warning:
    '官方插件约 24 小时需重新扫码，且每次登录机器人 ID 会变化。定位为个人助手入口，不建议承载核心业务。',
  docsUrl: 'https://github.com/Tencent/openclaw-weixin',
  setupGuide: [
    '点击「开始扫码」，用微信扫描弹出的二维码',
    '手机上确认登录（如果提示输入验证码，按页面提示填写）',
    '登录成功后自动开始接收消息；先在微信里给该机器人发条消息，点「绑定」拿验证码并回发 /绑定 验证码',
    '绑定后再点「发送测试消息」验证（未绑定时只能收到绑定指引）',
    '若状态变为「需重新扫码」，重新走第 1 步即可（旧会话不受影响）',
  ],
  configFields: [
    {
      key: 'baseUrl',
      label: '接入地址',
      type: 'text',
      placeholder: 'https://ilinkai.weixin.qq.com',
      help: '腾讯官方网关地址，一般不需要修改；私有部署时可按官方文档覆盖',
      default: 'https://ilinkai.weixin.qq.com',
    },
    {
      key: 'ilinkBotId',
      label: '机器人 ID',
      type: 'text',
      readOnly: true,
      help: '扫码成功后自动写入；每次重新扫码都可能变化',
    },
    {
      key: 'pollTimeoutMs',
      label: '长轮询超时（毫秒）',
      type: 'number',
      help: '服务端保持连接的时间，官方为 35000；调小会增加请求频率',
      default: 35000,
      min: 5000,
      max: 60000,
    },
    {
      key: 'botAgent',
      label: '客户端标识',
      type: 'text',
      help: '上报给微信的客户端标识，便于官方统计；一般不需要修改',
      default: 'VentoStack/1.0',
    },
    {
      key: 'qrStatusTimeoutMs',
      label: '扫码状态单次等待（毫秒）',
      type: 'number',
      help: '官方扫码状态接口是长轮询（无变化时挂 30 秒）。这里主动压短到 6 秒，避免管理后台 10 秒请求超时把每次轮询都掐断；调大需同步放宽前端超时',
      default: 6000,
      min: 2000,
      max: 20000,
    },
  ],
  secretFields: [
    {
      key: 'botToken',
      label: '机器人令牌',
      type: 'password',
      help: '扫码成功后自动写入，无需手动填写',
    },
  ],
  defaults: {
    baseUrl: 'https://ilinkai.weixin.qq.com',
    pollTimeoutMs: 35000,
    botAgent: 'VentoStack/1.0',
    qrStatusTimeoutMs: 6000,
    autoRelogin: true,
  },
  maxMessageLength: 2000,
  rateLimitPerMinute: 30,
  supportsEdit: false,
  supportsTyping: true,
};
