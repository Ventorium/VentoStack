/**
 * Ed25519 签名 / 验签（QQ 机器人 webhook）
 *
 * QQ 的规则比较特殊：签名私钥由 AppSecret **循环填充到 32 字节** 得到 seed，
 * 再用 Ed25519 签名。回调验证（op:13）要返回签名，事件推送（op:0）要验签。
 *
 * PKCS#8 包装 Ed25519 seed 的前缀是固定的：
 *   30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20  + seed(32)
 */

import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** AppSecret → 32 字节 seed（不足循环填充，超出截断） */
export function seedFromSecret(secret: string): Buffer {
  const source = Buffer.from(secret, 'utf8');
  if (source.length === 0) return Buffer.alloc(32);
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 1) out[i] = source[i % source.length] ?? 0;
  return out;
}

export function privateKeyFromSecret(secret: string): KeyObject {
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seedFromSecret(secret)]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

export function publicKeyFromSecret(secret: string): KeyObject {
  return createPublicKey(privateKeyFromSecret(secret));
}

/** 签名，返回十六进制（QQ 要求 hex 而非 base64） */
export function signHex(secret: string, message: string): string {
  return sign(null, Buffer.from(message, 'utf8'), privateKeyFromSecret(secret)).toString('hex');
}

/** 验签：任何异常都视为失败（fail-closed） */
export function verifyHex(secret: string, message: string, signatureHex: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(message, 'utf8'),
      publicKeyFromSecret(secret),
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}
