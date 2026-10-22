/**
 * 微信扫码登录回归测试
 *
 * 两个真实踩过的坑，用用例锁死：
 *
 * 1. `qrcode_img_content` 是**二维码要编码的内容**（liteapp 落地页 URL），不是图片。
 *    早期把它当 `<img src>` 用，页面拿到 text/html，二维码永远显示不出来。
 *    因此 adapter 对外暴露的字段叫 `qrcodeContent`，且必须原样透传。
 *
 * 2. `get_qrcode_status` 是长轮询，官方服务端无变化时 hold 约 30 秒；
 *    而管理后台前端 fetch client 全局超时 10 秒。等满就被前端 abort，
 *    浏览器里一片 cancelled、UI 上还显示成错误。现在的契约是：
 *    **单次等待受 `qrStatusTimeoutMs` 约束，超时一律当作 wait，且不带 detail**。
 *
 * 另外覆盖 `scaned_but_redirect`：官方迁移会话时会换 host，不跟着走会永远停在「已扫码」。
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { weixinIlinkAdapter } from '../adapters/weixin-ilink';
import type { ChannelRuntimeConfig } from '../types';

const REAL_FETCH = globalThis.fetch;

function runtimeConfig(overrides: Partial<ChannelRuntimeConfig> = {}): ChannelRuntimeConfig {
  return {
    id: 'ch-wx',
    tenantId: 'default',
    userId: 'u-1',
    type: 'weixin-ilink',
    name: '我的微信',
    config: { baseUrl: 'https://ilink.example.com', qrStatusTimeoutMs: 150 },
    secrets: {},
    runtimeState: {},
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 永不返回的 fetch，只有 abort 时 reject —— 模拟官方长轮询 hold 住不响应 */
function hangingFetch(): typeof fetch {
  return ((_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

describe('beginLogin', () => {
  test('登录 URL 原样作为二维码内容透传，不当成图片地址', async () => {
    const content = 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=abc123&bot_type=3';
    let calledUrl = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return jsonResponse({ ret: 0, qrcode: 'abc123', qrcode_img_content: content });
    }) as unknown as typeof fetch;

    const result = await weixinIlinkAdapter.beginLogin(runtimeConfig());

    expect(calledUrl).toContain('/ilink/bot/get_bot_qrcode');
    expect(result.qrcode).toBe('abc123');
    expect(result.qrcodeContent).toBe(content);
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  test('缺少字段时抛错而不是返回半个空对象', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ ret: 0, qrcode: 'abc123' })) as unknown as typeof fetch;

    await expect(weixinIlinkAdapter.beginLogin(runtimeConfig())).rejects.toThrow('获取二维码失败');
  });
});

describe('pollLogin', () => {
  test('长轮询被超时掐断时返回 wait 且不带 error detail', async () => {
    globalThis.fetch = hangingFetch();

    const startedAt = Date.now();
    const result = await weixinIlinkAdapter.pollLogin(runtimeConfig(), 'qr-1');
    const elapsed = Date.now() - startedAt;

    expect(result.status).toBe('wait');
    // abort 是长轮询的正常分支，绝不能冒出来让前端显示成错误
    expect(result.detail).toBeUndefined();
    // 单次等待必须受 qrStatusTimeoutMs 约束（测试里设 150ms），而不是等官方 30 秒
    expect(elapsed).toBeLessThan(2000);
  });

  test('scaned_but_redirect 会跟着 redirect_host 继续问并最终拿到凭证', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (urls.length === 1) {
        return jsonResponse({
          ret: 0,
          status: 'scaned_but_redirect',
          redirect_host: 'ilink2.example.com',
        });
      }
      return jsonResponse({
        ret: 0,
        status: 'confirmed',
        bot_token: 'token-xyz',
        ilink_bot_id: 'bot-42',
        baseurl: 'https://ilink2.example.com',
      });
    }) as unknown as typeof fetch;

    const result = await weixinIlinkAdapter.pollLogin(runtimeConfig(), 'qr-1');

    expect(result.status).toBe('confirmed');
    expect(result.secrets).toEqual({ botToken: 'token-xyz' });
    expect(result.configPatch).toEqual({
      ilinkBotId: 'bot-42',
      baseUrl: 'https://ilink2.example.com',
    });
    // 第二跳必须打到 redirect_host，且补上了协议头
    expect(urls[1]).toStartWith('https://ilink2.example.com/ilink/bot/get_qrcode_status');
    expect(urls[1]).toContain('qrcode=qr-1');
  });

  test('状态映射：need_verifycode / expired / blocked', async () => {
    for (const [raw, expected] of [
      ['need_verifycode', 'need_verifycode'],
      ['expired', 'expired'],
      ['wait', 'wait'],
      ['scaned', 'scaned'],
    ] as const) {
      globalThis.fetch = (async () =>
        jsonResponse({ ret: 0, status: raw })) as unknown as typeof fetch;
      const result = await weixinIlinkAdapter.pollLogin(runtimeConfig(), 'qr-1');
      expect(result.status).toBe(expected);
    }

    globalThis.fetch = (async () =>
      jsonResponse({ ret: 0, status: 'verify_code_blocked' })) as unknown as typeof fetch;
    const blocked = await weixinIlinkAdapter.pollLogin(runtimeConfig(), 'qr-1');
    expect(blocked.status).toBe('blocked');
    expect(blocked.detail).toContain('验证码');
  });

  test('平台返回非 0 ret 时降级为 wait 并带上原因，不中断轮询', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ ret: -1, errmsg: '服务繁忙' })) as unknown as typeof fetch;

    const result = await weixinIlinkAdapter.pollLogin(runtimeConfig(), 'qr-1');

    expect(result.status).toBe('wait');
    expect(result.detail).toBe('服务繁忙');
  });
});
