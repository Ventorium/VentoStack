/**
 * 渠道验签 / 解密工具
 *
 * 全部基于 Bun 内置 crypto（node:crypto 兼容层），不引第三方加密库。
 * 平台差异：
 *   飞书  sha256(timestamp + nonce + encryptKey + rawBody) → 十六进制
 *   企微  sha1(sort(token, timestamp, nonce, encrypt)) → 十六进制
 *   钉钉  base64(hmacSHA256(timestamp + "\n" + appSecret))
 *   企微/飞书消息体  AES-256-CBC + PKCS7
 */

import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** SHA-256 原始摘要（32 字节）：飞书 AES key 用的是二进制 digest，不是 hex 字符串 */
export function sha256Buffer(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

export function hmacSha256Base64(key: string, input: string): string {
  return createHmac('sha256', key).update(input, 'utf8').digest('base64');
}

export function hmacSha256Hex(key: string, input: string): string {
  return createHmac('sha256', key).update(input, 'utf8').digest('hex');
}

/** 恒定时间比较，避免通过响应时间侧信道猜测签名 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** PKCS7 去填充：填充非法时返回 null，由调用方按「解密失败」处理 */
function stripPkcs7(data: Buffer): Buffer | null {
  if (data.length === 0) return null;
  const pad = data[data.length - 1] ?? 0;
  if (pad < 1 || pad > 32 || pad > data.length) return null;
  for (let i = data.length - pad; i < data.length; i += 1) {
    if (data[i] !== pad) return null;
  }
  return data.subarray(0, data.length - pad);
}

/** AES-256-CBC 解密（key 长度必须是 32 字节） */
export function aes256CbcDecrypt(key: Buffer, iv: Buffer, ciphertext: Buffer): string | null {
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const stripped = stripPkcs7(plain);
    return stripped ? stripped.toString('utf8') : null;
  } catch {
    return null;
  }
}

/**
 * 企微 WXBizMsgCrypt 解密。
 * AESKey = base64decode(EncodingAESKey + "=")（43 字符补一个 = 得到 32 字节），
 * IV 取 key 前 16 字节（企微约定）。
 * 明文结构：random(16) + msg_len(4, 大端) + msg + receiveid
 */
export function wecomDecrypt(
  encodingAesKey: string,
  encrypted: string,
): { message: string; receiveId: string } | null {
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) return null;
  const plain = aes256CbcDecryptBuffer(key, key.subarray(0, 16), Buffer.from(encrypted, 'base64'));
  if (!plain) return null;
  return splitWecomPlain(plain);
}

function splitWecomPlain(buf: Buffer): { message: string; receiveId: string } | null {
  if (buf.length < 20) return null;
  const msgLen = buf.readUInt32BE(16);
  if (msgLen <= 0 || 20 + msgLen > buf.length) return null;
  const message = buf.subarray(20, 20 + msgLen).toString('utf8');
  const receiveId = buf.subarray(20 + msgLen).toString('utf8');
  return { message, receiveId };
}

/** 二进制安全的 CBC 解密（企微用：明文含长度头，不能先转字符串） */
export function aes256CbcDecryptBuffer(key: Buffer, iv: Buffer, ciphertext: Buffer): Buffer | null {
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return stripPkcs7(plain);
  } catch {
    return null;
  }
}
