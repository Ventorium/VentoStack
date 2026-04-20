// @aeron/auth - TOTP 双因素认证 (RFC 6238)
// 基于 Web Crypto API HMAC 实现

export interface TOTPOptions {
  digits?: number; // 默认 6
  period?: number; // 默认 30 秒
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512"; // 默认 SHA-1 (兼容性)
  window?: number; // 默认 1（前后各1个时间窗口）
}

export interface TOTPManager {
  generateSecret(): string;
  generateURI(secret: string, issuer: string, account: string): string;
  generate(secret: string, time?: number): Promise<string>;
  verify(secret: string, token: string, time?: number): Promise<boolean>;
}

// Base32 (RFC 4648) A-Z2-7
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(data: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(output);
}

const ALGORITHM_MAP: Record<string, string> = {
  "SHA-1": "SHA-1",
  "SHA-256": "SHA-256",
  "SHA-512": "SHA-512",
};

export function createTOTP(options: TOTPOptions = {}): TOTPManager {
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const algorithm = options.algorithm ?? "SHA-1";
  const window = options.window ?? 1;

  async function hmacSign(
    secret: Uint8Array,
    data: Uint8Array,
  ): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: ALGORITHM_MAP[algorithm]! },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, data);
    return new Uint8Array(sig);
  }

  function intToBytes(num: number): Uint8Array {
    const bytes = new Uint8Array(8);
    // Big-endian 8-byte encoding
    let n = num;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = n & 0xff;
      n = Math.floor(n / 256);
    }
    return bytes;
  }

  async function generateOTP(
    secret: Uint8Array,
    counter: number,
  ): Promise<string> {
    const counterBytes = intToBytes(counter);
    const hash = await hmacSign(secret, counterBytes);

    // Dynamic truncation (RFC 4226)
    const offset = hash[hash.length - 1]! & 0x0f;
    const code =
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff);

    const otp = code % Math.pow(10, digits);
    return otp.toString().padStart(digits, "0");
  }

  return {
    generateSecret(): string {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return base32Encode(bytes);
    },

    generateURI(secret: string, issuer: string, account: string): string {
      const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
      const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: algorithm.replace("-", ""),
        digits: digits.toString(),
        period: period.toString(),
      });
      return `otpauth://totp/${label}?${params.toString()}`;
    },

    async generate(secret: string, time?: number): Promise<string> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);
      return generateOTP(secretBytes, counter);
    },

    async verify(
      secret: string,
      token: string,
      time?: number,
    ): Promise<boolean> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);

      for (let i = -window; i <= window; i++) {
        const otp = await generateOTP(secretBytes, counter + i);
        if (otp === token) {
          return true;
        }
      }

      return false;
    },
  };
}
