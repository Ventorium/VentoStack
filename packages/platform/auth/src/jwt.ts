/**
 * @ventostack/auth - JWT 签发与验证
 * 基于 Web Crypto API，仅允许 HMAC 算法（HS256/HS384/HS512）
 */

import { UnauthorizedError } from "@ventostack/core";

/** 支持的 JWT 签名算法 */
export type JWTAlgorithm = "HS256" | "HS384" | "HS512";

/** 算法白名单，禁止非白名单算法 */
const ALGORITHM_WHITELIST: ReadonlySet<string> = new Set(["HS256", "HS384", "HS512"]);

/** JWT 算法到 Web Crypto 哈希算法的映射 */
const ALGORITHM_MAP: Record<JWTAlgorithm, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

/** 密钥最小字节数（256-bit） */
const MIN_SECRET_BYTES = 32;

/** JWT Payload 标准字段与自定义扩展 */
export interface JWTPayload {
  /** 主题（用户标识） */
  sub?: string;
  /** 签发者 */
  iss?: string;
  /** 受众 */
  aud?: string;
  /** 过期时间（Unix 时间戳，秒） */
  exp?: number;
  /** 生效时间（Unix 时间戳，秒） */
  nbf?: number;
  /** 签发时间（Unix 时间戳，秒） */
  iat?: number;
  /** JWT ID（唯一标识） */
  jti?: string;
  /** 自定义扩展字段 */
  [key: string]: unknown;
}

/** JWT 签名与验证选项 */
export interface JWTOptions {
  /** 签名算法，默认 HS256 */
  algorithm?: JWTAlgorithm;
  /** 签发者 */
  issuer?: string;
  /** 受众 */
  audience?: string;
  /** 过期时长（秒） */
  expiresIn?: number;
}

/** JWT 管理器配置 */
export interface JWTConfig {
  /** 默认密钥 */
  secret?: string;
  /** 默认选项 */
  defaultOptions?: JWTOptions;
}

/** JWT 管理器接口 */
export interface JWTManager {
  /**
   * 签发 JWT
   * @param payload JWT 载荷数据
   * @param secret 密钥（可选，默认使用配置中的密钥）
   * @param options 签名选项（可选，默认使用配置中的选项）
   * @returns 签发的 JWT 字符串
   */
  sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string>;

  /**
   * 验证 JWT
   * @param token JWT 字符串
   * @param secret 密钥（可选）
   * @param options 验证选项（可选）
   * @returns 验证通过后的 Payload
   * @throws UnauthorizedError 验证失败时抛出
   */
  verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload>;

  /**
   * 解码 JWT（不验证签名）
   * @param token JWT 字符串
   * @returns Payload 对象，格式错误返回 null
   */
  decode(token: string): JWTPayload | null;
}

/**
 * Base64URL 编码 Uint8Array
 * @param data 字节数组
 * @returns Base64URL 字符串
 */
function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL 编码字符串
 * @param str 原始字符串
 * @returns Base64URL 字符串
 */
function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

/**
 * Base64URL 解码为 Uint8Array
 * @param str Base64URL 字符串
 * @returns 字节数组
 */
function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL 解码为字符串
 * @param str Base64URL 字符串
 * @returns 解码后的字符串
 */
function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}

/**
 * 校验密钥长度是否满足安全要求
 * @param secret 密钥字符串
 * @throws 密钥长度不足时抛出 Error
 */
function validateSecret(secret: string): void {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `Secret must be at least ${MIN_SECRET_BYTES} bytes (256-bit), got ${bytes.length} bytes`,
    );
  }
}

/**
 * 导入 HMAC 密钥到 Web Crypto
 * @param secret 密钥字符串
 * @param algorithm JWT 算法
 * @returns CryptoKey 对象
 */
async function importKey(secret: string, algorithm: JWTAlgorithm): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: ALGORITHM_MAP[algorithm] },
    false,
    ["sign", "verify"],
  );
}

/**
 * 创建 JWT 管理器实例
 * @param config JWT 配置（可选）
 * @returns JWT 管理器实例
 */
export function createJWT(config?: JWTConfig): JWTManager {
  const defaultSecret = config?.secret;
  const defaultOptions = config?.defaultOptions;

  /**
   * 解析最终使用的密钥
   * @param secret 调用时传入的密钥（优先）
   * @returns 解析后的密钥
   * @throws 未提供密钥时抛出 Error
   */
  function resolveSecret(secret?: string): string {
    const s = secret ?? defaultSecret;
    if (!s) {
      throw new Error("JWT secret is required. Provide it via createJWT({ secret }) or sign()/verify().");
    }
    return s;
  }

  /**
   * 合并默认选项与调用选项
   * @param options 调用时传入的选项
   * @returns 合并后的选项
   */
  function mergeOptions(options?: JWTOptions): JWTOptions {
    return {
      ...defaultOptions,
      ...options,
    };
  }

  return {
    async sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string> {
      const resolvedSecret = resolveSecret(secret);
      const merged = mergeOptions(options);
      validateSecret(resolvedSecret);

      const algorithm = merged.algorithm ?? "HS256";
      if (!ALGORITHM_WHITELIST.has(algorithm)) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const now = Math.floor(Date.now() / 1000);
      const finalPayload: JWTPayload = {
        ...payload,
        iat: now,
      };

      if (merged.issuer) {
        finalPayload.iss = merged.issuer;
      }
      if (merged.audience) {
        finalPayload.aud = merged.audience;
      }
      if (merged.expiresIn != null) {
        finalPayload.exp = now + merged.expiresIn;
      }

      const header = base64urlEncodeString(JSON.stringify({ alg: algorithm, typ: "JWT" }));
      const body = base64urlEncodeString(JSON.stringify(finalPayload));
      const signingInput = `${header}.${body}`;

      const key = await importKey(resolvedSecret, algorithm);
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput),
      );

      const sig = base64urlEncode(new Uint8Array(signature));
      return `${signingInput}.${sig}`;
    },

    async verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload> {
      const resolvedSecret = resolveSecret(secret);
      const merged = mergeOptions(options);
      validateSecret(resolvedSecret);

      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new UnauthorizedError("Invalid token format");
      }

      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

      // Decode and validate header
      let header: { alg?: string; typ?: string };
      try {
        header = JSON.parse(base64urlDecodeString(headerPart));
      } catch {
        throw new UnauthorizedError("无效的令牌头");
      }

      if (!header.alg || !ALGORITHM_WHITELIST.has(header.alg)) {
        throw new UnauthorizedError(`不支持的算法：${header.alg ?? "none"}`);
      }

      // Validate typ header: if present, must be "JWT"
      if (header.typ !== undefined && header.typ !== "JWT") {
        throw new UnauthorizedError("无效的令牌类型");
      }

      const algorithm = header.alg as JWTAlgorithm;
      const expectedAlgorithm = merged.algorithm ?? algorithm;
      if (algorithm !== expectedAlgorithm) {
        throw new UnauthorizedError(
          `算法不匹配：期望 ${expectedAlgorithm}，实际 ${algorithm}`,
        );
      }

      // Verify signature using crypto.subtle.verify (constant-time)
      const key = await importKey(resolvedSecret, algorithm);
      const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      const signature = base64urlDecode(signaturePart);

      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        signature as unknown as Uint8Array<ArrayBuffer>,
        signingInput,
      );
      if (!valid) {
        throw new UnauthorizedError("Invalid signature");
      }

      // Decode payload
      let payload: JWTPayload;
      try {
        payload = JSON.parse(base64urlDecodeString(payloadPart));
      } catch {
        throw new UnauthorizedError("Invalid token payload");
      }

      const now = Math.floor(Date.now() / 1000);

      // Check exp
      if (payload.exp != null && payload.exp <= now) {
        throw new UnauthorizedError("Token expired");
      }

      // Check nbf
      if (payload.nbf != null && payload.nbf > now) {
        throw new UnauthorizedError("Token not yet valid");
      }

      // Check issuer
      if (merged.issuer && payload.iss !== merged.issuer) {
        throw new UnauthorizedError(
          `Issuer mismatch: expected ${merged.issuer}, got ${payload.iss}`,
        );
      }

      // Check audience
      if (merged.audience && payload.aud !== merged.audience) {
        throw new UnauthorizedError(
          `Audience mismatch: expected ${merged.audience}, got ${payload.aud}`,
        );
      }

      return payload;
    },

    decode(token: string): JWTPayload | null {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        return JSON.parse(base64urlDecodeString(parts[1]!));
      } catch {
        return null;
      }
    },
  };
}
