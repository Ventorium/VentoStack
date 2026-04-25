/**
 * @ventostack/webhook - 加密工具
 * HMAC 签名、恒定时间比较、指数退避、RSA 验签
 */

/**
 * 计算 HMAC 签名
 * @param body 待签名数据
 * @param secret 密钥
 * @param algorithm 算法（sha256 / sha384 / sha512）
 * @returns 十六进制签名字符串
 */
export function hmacSign(body: string, secret: string, algorithm: string): string {
  const hasher = new Bun.CryptoHasher(algorithm as Bun.SupportedCryptoAlgorithms, secret);
  hasher.update(body);
  return hasher.digest("hex");
}

/**
 * 恒定时间字符串比较，防止时序攻击
 * @param a 字符串 a
 * @param b 字符串 b
 * @returns 是否相等
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * 计算指数退避间隔（含随机抖动）
 * @param attempt 当前尝试次数（从 0 开始）
 * @param baseInterval 基础间隔（毫秒）
 * @param maxInterval 最大间隔（毫秒）
 * @returns 下次重试等待时间（毫秒）
 */
export function exponentialBackoff(
  attempt: number,
  baseInterval: number,
  maxInterval: number,
): number {
  const jitter = Math.random() * 0.1 * baseInterval;
  const delay = baseInterval * Math.pow(2, attempt) + jitter;
  return Math.min(delay, maxInterval);
}

/**
 * RSA-SHA256 签名验证（用于微信支付、支付宝等非对称验证）
 * @param payload 待验证数据
 * @param signature Base64 编码的签名
 * @param publicKeyPem PEM 格式公钥
 * @returns 签名是否有效
 */
export async function rsaSha256Verify(
  payload: string,
  signature: string,
  publicKeyPem: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToBuffer(publicKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const encoder = new TextEncoder();
    const sigBuffer = base64ToBuffer(signature);

    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      sigBuffer,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

/**
 * PEM 格式公钥转 ArrayBuffer
 */
function pemToBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN.*?-----/g, "")
    .replace(/-----END.*?-----/g, "")
    .replace(/\s/g, "");
  return base64ToBuffer(b64);
}

/**
 * Base64 字符串转 ArrayBuffer
 */
function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
