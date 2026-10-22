/**
 * adapter 注册表
 *
 * adapter 只做三件事：验签解密 → 归一化 → 发送。
 * 会话解析、命令、串行锁、LLM 调用全在管线里，因此新增渠道
 * 只需写一个 adapter，自动获得命令、会话延续、限流、审计、幂等。
 */

import type { ChannelAdapter, ChannelType, QrLoginAdapter } from '../types';
import { dingtalkAdapter } from './dingtalk-app';
import { feishuAdapter } from './feishu-app';
import { mqttAdapter } from './mqtt';
import { qqbotAdapter } from './qqbot';
import { wecomAdapter } from './wecom-app';
import { weixinIlinkAdapter } from './weixin-ilink';

const ADAPTERS: readonly ChannelAdapter[] = [
  weixinIlinkAdapter,
  qqbotAdapter,
  feishuAdapter,
  wecomAdapter,
  dingtalkAdapter,
  mqttAdapter,
];

const BY_TYPE = new Map<string, ChannelAdapter>(ADAPTERS.map((a) => [a.type, a]));

export function getAdapter(type: string): ChannelAdapter | undefined {
  return BY_TYPE.get(type);
}

export function listAdapters(): readonly ChannelAdapter[] {
  return ADAPTERS;
}

/** 扫码登录能力（只有 weixin-ilink 实现） */
export function getQrLoginAdapter(type: ChannelType): QrLoginAdapter | undefined {
  if (type !== 'weixin-ilink') return undefined;
  return weixinIlinkAdapter as ChannelAdapter & QrLoginAdapter;
}
