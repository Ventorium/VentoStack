/**
 * 渠道删除的清理语义回归测试
 *
 * `ai_channel_message` 刻意没有外键（高频写入，外键会拖慢并放大锁竞争），
 * 所以 identity / channel_session 靠 ON DELETE CASCADE，而**消息记录必须显式清理**。
 *
 * 曾经漏掉这一步，后果不只是脏数据：留下的是待发行（status=pending），
 * 出站队列还会对一个已经不存在的渠道反复重试，一路耗到 MAX_SEND_ATTEMPTS。
 *
 * 同时锁住「AI 会话本体不删」的意图——用户的会话可能还在 Web 端继续用。
 */

import { describe, expect, test } from 'bun:test';
import type { ConfigEncryptor } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { createChannelService } from '../services/channel';

interface RawCall {
  sql: string;
  params: unknown[];
}

/** 只实现 raw 的假 db：按 SQL 关键字决定返回值，并记录调用顺序 */
function fakeDb(options: { channelExists?: boolean } = {}): {
  db: Database;
  calls: RawCall[];
} {
  const calls: RawCall[] = [];
  const { channelExists = true } = options;

  const db = {
    async raw(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/DELETE\s+FROM\s+ai_channel\s+WHERE/i.test(sql)) {
        return channelExists ? [{ id: params[0] }] : [];
      }
      return [];
    },
  } as unknown as Database;

  return { db, calls };
}

const encryptor = {
  async encrypt(value: string) {
    return `ENC:${value}`;
  },
  async decrypt(value: string) {
    return value.replace(/^ENC:/, '');
  },
} as ConfigEncryptor;

const SCOPE = { tenantId: 'default', userId: 'u-1' };

describe('删除渠道', () => {
  test('删除成功后显式清理该渠道的消息记录', async () => {
    const { db, calls } = fakeDb();
    const service = createChannelService({ db, encryptor });

    await service.remove('ch-1', SCOPE);

    const messageDeletes = calls.filter((call) =>
      /DELETE\s+FROM\s+ai_channel_message/i.test(call.sql),
    );
    expect(messageDeletes).toHaveLength(1);
    // 必须按 channel_id + tenant_id 双条件删，避免跨租户误删
    expect(messageDeletes[0]?.params).toEqual(['ch-1', 'default']);
  });

  test('先删渠道再删消息（顺序不能反，否则清理期间新写入会变孤儿）', async () => {
    const { db, calls } = fakeDb();
    const service = createChannelService({ db, encryptor });

    await service.remove('ch-1', SCOPE);

    const channelIndex = calls.findIndex((call) =>
      /DELETE\s+FROM\s+ai_channel\s+WHERE/i.test(call.sql),
    );
    const messageIndex = calls.findIndex((call) =>
      /DELETE\s+FROM\s+ai_channel_message/i.test(call.sql),
    );
    expect(channelIndex).toBeGreaterThanOrEqual(0);
    expect(messageIndex).toBeGreaterThan(channelIndex);
  });

  test('渠道不存在时报 404 且不误删任何消息', async () => {
    const { db, calls } = fakeDb({ channelExists: false });
    const service = createChannelService({ db, encryptor });

    await expect(service.remove('ch-missing', SCOPE)).rejects.toThrow(/渠道不存在/);

    expect(calls.some((call) => /ai_channel_message/i.test(call.sql))).toBe(false);
  });

  test('不删除 AI 会话本体（用户可能还在 Web 端继续用）', async () => {
    const { db, calls } = fakeDb();
    const service = createChannelService({ db, encryptor });

    await service.remove('ch-1', SCOPE);

    // ai_session_meta 属于 AI 模块，渠道侧只解除绑定、不销毁会话
    expect(calls.some((call) => /ai_session_meta/i.test(call.sql))).toBe(false);
  });
});
