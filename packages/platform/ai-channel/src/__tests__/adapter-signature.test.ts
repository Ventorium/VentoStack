/**
 * 入站验签回归测试
 *
 * 入站路由 `/api/ai/channels/inbound/:id` 是**匿名**的（平台回调无法带平台 JWT），
 * 所以适配器的验签是唯一的身份保证。历史上钉钉与 QQ 都曾写成 `if (signature) { 校验 }`，
 * 即「不带签名头就完全跳过校验」——任何人拿到 channelId 就能伪造用户消息并触发 AI 回复。
 *
 * 这组用例锁死两件事：
 *   1. 缺签名头必须拒绝（fail-closed），不能因为「没带」而放行
 *   2. 签名/时间戳错误必须拒绝
 */

import { describe, expect, test } from 'bun:test';
import { dingtalkAdapter } from '../adapters/dingtalk-app';
import { qqbotAdapter } from '../adapters/qqbot';
import { hmacSha256Base64 } from '../crypto';
import { signHex } from '../crypto/ed25519';
import type { ChannelRuntimeConfig } from '../types';

const APP_SECRET = 'test-secret-abc';

function runtimeConfig(overrides: Partial<ChannelRuntimeConfig> = {}): ChannelRuntimeConfig {
  return {
    id: 'ch-1',
    tenantId: 'default',
    userId: 'u-1',
    type: 'dingtalk-app',
    name: '测试渠道',
    config: {},
    secrets: { appSecret: APP_SECRET },
    runtimeState: {},
    ...overrides,
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/ai/channels/inbound/ch-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const DD_BODY = {
  msgtype: 'text',
  text: { content: '你好' },
  msgId: 'dd-msg-1',
  senderStaffId: 'staff-001',
  senderNick: '测试用户',
  conversationId: 'cid-001',
  conversationType: '1',
};

function ddSign(timestamp: string, secret = APP_SECRET): string {
  return hmacSha256Base64(secret, `${timestamp}\n${secret}`);
}

describe('钉钉 adapter 验签（fail-closed）', () => {
  test('缺少 sign 头直接拒绝', async () => {
    const request = jsonRequest(DD_BODY);
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/缺少 sign/);
  });

  test('只有 timestamp 没有 sign 也要拒绝', async () => {
    const request = jsonRequest(DD_BODY, { timestamp: String(Date.now()) });
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/缺少 sign/);
  });

  test('签名错误拒绝', async () => {
    const timestamp = String(Date.now());
    const request = jsonRequest(DD_BODY, { timestamp, sign: 'wrong-signature' });
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/签名校验失败/);
  });

  test('用别的密钥签出来的签名拒绝', async () => {
    const timestamp = String(Date.now());
    const request = jsonRequest(DD_BODY, {
      timestamp,
      sign: ddSign(timestamp, 'another-secret'),
    });
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/签名校验失败/);
  });

  test('时间戳超出 5 分钟窗口拒绝', async () => {
    const stale = String(Date.now() - 6 * 60 * 1000);
    const request = jsonRequest(DD_BODY, { timestamp: stale, sign: ddSign(stale) });
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/时间戳超出/);
  });

  test('时间戳非数字拒绝', async () => {
    const request = jsonRequest(DD_BODY, { timestamp: 'not-a-number', sign: 'x' });
    await expect(dingtalkAdapter.parse(request, runtimeConfig())).rejects.toThrow(/时间戳超出/);
  });

  test('签名正确时正常解析出文本消息', async () => {
    const timestamp = String(Date.now());
    const request = jsonRequest(DD_BODY, { timestamp, sign: ddSign(timestamp) });
    const result = await dingtalkAdapter.parse(request, runtimeConfig());

    expect(result.messages).toHaveLength(1);
    const message = result.messages[0];
    expect(message?.text).toBe('你好');
    expect(message?.externalUserId).toBe('staff-001');
    expect(message?.externalKey).toBe('dm:staff-001');
    expect(message?.externalMessageId).toBe('dd-msg-1');
    expect(message?.replyContext).toEqual({ conversationId: 'cid-001' });
  });

  test('群会话（conversationType=2）不产生消息但仍回 ack', async () => {
    const timestamp = String(Date.now());
    const request = jsonRequest(
      { ...DD_BODY, conversationType: '2' },
      { timestamp, sign: ddSign(timestamp) },
    );
    const result = await dingtalkAdapter.parse(request, runtimeConfig());

    expect(result.messages).toHaveLength(0);
    expect(result.ack).toBeDefined();
  });
});

describe('QQ adapter 验签（fail-closed）', () => {
  const QQ_BODY = {
    op: 0,
    t: 'C2C_MESSAGE_CREATE',
    id: 'qq-evt-1',
    d: {
      id: 'qq-msg-1',
      content: '你好',
      timestamp: '2026-01-01T00:00:00Z',
      author: { user_openid: 'openid-1' },
    },
  };

  function qqConfig(): ChannelRuntimeConfig {
    return runtimeConfig({ type: 'qqbot', secrets: { appSecret: APP_SECRET } });
  }

  test('缺少 X-Signature-Ed25519 头直接拒绝', async () => {
    const request = jsonRequest(QQ_BODY, { 'X-Signature-Timestamp': String(Date.now()) });
    await expect(qqbotAdapter.parse(request, qqConfig())).rejects.toThrow(/缺少 X-Signature/);
  });

  test('签名错误拒绝', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const request = jsonRequest(QQ_BODY, {
      'X-Signature-Timestamp': timestamp,
      'X-Signature-Ed25519': 'deadbeef',
    });
    await expect(qqbotAdapter.parse(request, qqConfig())).rejects.toThrow(/签名校验失败/);
  });

  test('时间戳超出 5 分钟窗口拒绝', async () => {
    const stale = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const signature = signHex(APP_SECRET, `${stale}${JSON.stringify(QQ_BODY)}`);
    const request = jsonRequest(QQ_BODY, {
      'X-Signature-Timestamp': stale,
      'X-Signature-Ed25519': signature,
    });
    await expect(qqbotAdapter.parse(request, qqConfig())).rejects.toThrow(/时间戳超出/);
  });

  test('签名正确时正常解析并回 op:12 ack', async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const raw = JSON.stringify(QQ_BODY);
    const signature = signHex(APP_SECRET, `${timestamp}${raw}`);
    const request = new Request('http://localhost/api/ai/channels/inbound/ch-1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature-Timestamp': timestamp,
        'X-Signature-Ed25519': signature,
      },
      body: raw,
    });

    const result = await qqbotAdapter.parse(request, qqConfig());
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.externalKey).toBe('dm:openid-1');
    // QQ 要求 5 秒内回 { op: 12 }，否则平台重投
    const ackBody = await result.ack?.json();
    expect(ackBody).toEqual({ op: 12 });
  });
});
