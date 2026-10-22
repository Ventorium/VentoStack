import { describe, expect, test } from 'bun:test';
import { createCipheriv, randomBytes } from 'node:crypto';
import {
  aes256CbcDecrypt,
  aes256CbcDecryptBuffer,
  hmacSha256Base64,
  hmacSha256Hex,
  safeEqual,
  sha1Hex,
  sha256Buffer,
  sha256Hex,
  wecomDecrypt,
} from '../crypto';

/** PKCS7 补齐（测试构造密文用；生产只解密不加密） */
function pkcs7Pad(data: Buffer, block = 16): Buffer {
  const pad = block - (data.length % block);
  return Buffer.concat([data, Buffer.alloc(pad, pad)]);
}

function encryptCbc(key: Buffer, iv: Buffer, plain: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(pkcs7Pad(plain)), cipher.final()]);
}

describe('摘要 / 签名', () => {
  test('sha256Hex 对固定向量', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('sha256Buffer 返回 32 字节原始摘要（飞书 AES key 依赖它，不能用 hex 串）', () => {
    const buf = sha256Buffer('abc');
    expect(buf.length).toBe(32);
    expect(buf.toString('hex')).toBe(sha256Hex('abc'));
  });

  test('sha1Hex 对固定向量', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  test('hmacSha256Base64 对 RFC 4231 用例', () => {
    expect(hmacSha256Base64('Jefe', 'what do ya want for nothing?')).toBe(
      'W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=',
    );
  });

  test('hmacSha256Hex 与 base64 版本同源', () => {
    const hex = hmacSha256Hex('Jefe', 'what do ya want for nothing?');
    expect(Buffer.from(hex, 'hex').toString('base64')).toBe(
      hmacSha256Base64('Jefe', 'what do ya want for nothing?'),
    );
  });
});

describe('safeEqual', () => {
  test('相同字符串相等', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  test('不同内容不相等', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  test('长度不同直接 false（timingSafeEqual 会抛错，必须先比长度）', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  test('空串相等', () => {
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('AES-256-CBC 解密', () => {
  const zeroKey = Buffer.alloc(32, 0);
  const zeroIv = Buffer.alloc(16, 0);

  test('解固定向量（key/iv 全 0，明文 hello world）', () => {
    const ct = Buffer.from('56cbe187babf7b5df62924d78a3a5099', 'hex');
    expect(aes256CbcDecrypt(zeroKey, zeroIv, ct)).toBe('hello world');
  });

  test('密文被篡改时返回 null 而非抛错', () => {
    const ct = Buffer.from('56cbe187babf7b5df62924d78a3a5099', 'hex');
    const broken = Buffer.from(ct);
    broken[0] = (broken[0] ?? 0) ^ 0xff;
    // 解密结果非法，PKCS7 去填充失败
    expect(aes256CbcDecrypt(zeroKey, zeroIv, broken)).toBeNull();
  });

  test('空密文返回 null', () => {
    expect(aes256CbcDecryptBuffer(zeroKey, zeroIv, Buffer.alloc(0))).toBeNull();
  });

  test('Buffer 版保留二进制（企微明文含 4 字节长度头，不能先转字符串）', () => {
    const payload = Buffer.concat([Buffer.from([0, 0, 0, 3]), Buffer.from('你好', 'utf8')]);
    const ct = encryptCbc(zeroKey, zeroIv, payload);
    const out = aes256CbcDecryptBuffer(zeroKey, zeroIv, ct);
    expect(out).not.toBeNull();
    expect(out?.readUInt32BE(0)).toBe(3);
    expect(out?.subarray(4).toString('utf8')).toBe('你好');
  });
});

describe('wecomDecrypt', () => {
  /** 按企微规范构造一条密文：random(16) + len(4, BE) + msg + receiveId */
  function buildWecomCipher(encodingAesKey: string, message: string, receiveId: string): string {
    const key = Buffer.from(`${encodingAesKey}=`, 'base64');
    const msgBuf = Buffer.from(message, 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(msgBuf.length, 0);
    const plain = Buffer.concat([randomBytes(16), lenBuf, msgBuf, Buffer.from(receiveId, 'utf8')]);
    return encryptCbc(key, key.subarray(0, 16), plain).toString('base64');
  }

  test('解出明文与 receiveId', () => {
    const aesKey = randomBytes(32);
    const encodingAesKey = aesKey.toString('base64').replace(/=+$/, '');
    const encrypted = buildWecomCipher(encodingAesKey, '<xml>hello</xml>', 'corp-id-123');

    const out = wecomDecrypt(encodingAesKey, encrypted);
    expect(out?.message).toBe('<xml>hello</xml>');
    expect(out?.receiveId).toBe('corp-id-123');
  });

  test('关键词为多字节中文时长度按字节计', () => {
    const aesKey = randomBytes(32);
    const encodingAesKey = aesKey.toString('base64').replace(/=+$/, '');
    const encrypted = buildWecomCipher(encodingAesKey, '你好世界', 'corp');
    expect(wecomDecrypt(encodingAesKey, encrypted)?.message).toBe('你好世界');
  });

  test('EncodingAESKey 长度非法时返回 null', () => {
    expect(wecomDecrypt('tooshort', 'AAAA')).toBeNull();
  });

  test('密文非法时返回 null', () => {
    const encodingAesKey = randomBytes(32).toString('base64').replace(/=+$/, '');
    expect(wecomDecrypt(encodingAesKey, 'bm90LWEtY2lwaGVy')).toBeNull();
  });
});
