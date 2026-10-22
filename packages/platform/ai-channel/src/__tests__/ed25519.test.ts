import { describe, expect, test } from 'bun:test';
import {
  privateKeyFromSecret,
  publicKeyFromSecret,
  seedFromSecret,
  signHex,
  verifyHex,
} from '../crypto/ed25519';

describe('seedFromSecret', () => {
  test('AppSecret 循环填充到 32 字节', () => {
    // 'abc' 循环 → 32 字节 = abcabc... (10 组 30) + 'ab'
    expect(seedFromSecret('abc').toString('utf8')).toBe(`${'abc'.repeat(10)}ab`);
  });

  test('恰好 32 字节时原样使用', () => {
    const secret = 'x'.repeat(32);
    expect(seedFromSecret(secret).toString('utf8')).toBe(secret);
  });

  test('超过 32 字节时截断', () => {
    expect(seedFromSecret('x'.repeat(40)).toString('utf8')).toBe('x'.repeat(32));
  });

  test('空 secret 退化为全 0（避免生成非法私钥）', () => {
    const seed = seedFromSecret('');
    expect(seed.length).toBe(32);
    expect(seed.every((b) => b === 0)).toBe(true);
  });

  test('按字节而非字符填充（中文 secret 不会半个字节）', () => {
    // '中' 是 3 字节；32 不是 3 的整数倍，末位必然落在字节边界上
    const seed = seedFromSecret('中');
    expect(seed.length).toBe(32);
    expect(seed.subarray(0, 3).toString('utf8')).toBe('中');
    expect(seed.subarray(3, 6).toString('utf8')).toBe('中');
  });
});

describe('签名往返', () => {
  test('signHex + verifyHex 通过', () => {
    const secret = 'test-app-secret';
    const message = '{"op":13,"d":{"plain_token":"abc","event_ts":"123"}}';
    const sig = signHex(secret, message);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyHex(secret, message, sig)).toBe(true);
  });

  test('同一 secret + 消息签名稳定（Ed25519 确定性签名）', () => {
    expect(signHex('s', 'm')).toBe(signHex('s', 'm'));
  });

  test('消息被篡改则验签失败', () => {
    const sig = signHex('secret', 'original');
    expect(verifyHex('secret', 'tampered', sig)).toBe(false);
  });

  test('secret 不匹配则验签失败', () => {
    const sig = signHex('secret-a', 'message');
    expect(verifyHex('secret-b', 'message', sig)).toBe(false);
  });

  test('非法 hex 签名不抛错，返回 false（fail-closed）', () => {
    expect(verifyHex('secret', 'message', 'zzzz')).toBe(false);
    expect(verifyHex('secret', 'message', '')).toBe(false);
  });

  test('公钥可由私钥派生', () => {
    const pub = publicKeyFromSecret('secret');
    expect(pub.asymmetricKeyType).toBe('ed25519');
    expect(privateKeyFromSecret('secret').asymmetricKeyType).toBe('ed25519');
  });
});
