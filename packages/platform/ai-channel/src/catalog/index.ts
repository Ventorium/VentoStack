/**
 * 渠道目录聚合
 *
 * 前端「添加渠道」网格与配置表单完全由这里驱动；后端用它做默认值填充、
 * 必填校验与出站分片长度。新增渠道 = 目录加一项 + 写一个 adapter。
 */

import type { ChannelType } from '../types';
import { dingtalkApp } from './dingtalk-app';
import { feishuApp } from './feishu-app';
import { mqtt } from './mqtt';
import { qqbot } from './qqbot';
import type { ChannelCatalogEntry } from './types';
import { wecomApp } from './wecom-app';
import { weixinIlink } from './weixin-ilink';

export type {
  ChannelCatalogEntry,
  ChannelField,
  ChannelFieldOption,
  ChannelFieldType,
  ChannelSetupLink,
} from './types';

/** 全部渠道（顺序即前端展示顺序） */
export const CHANNEL_CATALOG: readonly ChannelCatalogEntry[] = [
  weixinIlink,
  qqbot,
  feishuApp,
  wecomApp,
  dingtalkApp,
  mqtt,
];

const BY_TYPE = new Map<string, ChannelCatalogEntry>(
  CHANNEL_CATALOG.map((entry) => [entry.type, entry]),
);

export function getCatalogEntry(type: string): ChannelCatalogEntry | undefined {
  return BY_TYPE.get(type);
}

export function isChannelType(value: string): value is ChannelType {
  return BY_TYPE.has(value);
}

/** 必填字段（配置 + 凭证），用于保存前校验与前端标星 */
export function requiredFields(type: string): {
  config: string[];
  secrets: string[];
} {
  const entry = getCatalogEntry(type);
  if (!entry) return { config: [], secrets: [] };
  return {
    config: entry.configFields.filter((f) => f.required).map((f) => f.key),
    secrets: entry.secretFields.filter((f) => f.required).map((f) => f.key),
  };
}

/** 目录默认值（用户不必填的项） */
export function defaultConfig(type: string): Record<string, unknown> {
  const entry = getCatalogEntry(type);
  if (!entry) return {};
  const fromFields: Record<string, unknown> = {};
  for (const field of [...entry.configFields, ...entry.secretFields]) {
    if (field.default !== undefined) fromFields[field.key] = field.default;
  }
  return { ...entry.defaults, ...fromFields };
}

/** 出站分片长度：优先取渠道配置的 maxMessageLength，其次目录上限 */
export function resolveMaxMessageLength(type: string, config: Record<string, unknown>): number {
  const entry = getCatalogEntry(type);
  const fallback = entry?.maxMessageLength ?? 2000;
  const configured = config.maxMessageLength;
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, entry?.maxMessageLength ?? configured);
  }
  return fallback;
}
