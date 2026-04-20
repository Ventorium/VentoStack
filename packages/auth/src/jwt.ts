// @aeron/auth - JWT 签发与验证
// 基于 Web Crypto API，仅允许 HMAC 算法（HS256/HS384/HS512）

import { UnauthorizedError } from "@aeron/core";

export type JWTAlgorithm = "HS256" | "HS384" | "HS512";

const ALGORITHM_WHITELIST: ReadonlySet<string> = new Set([
  "HS256",
  "HS384",
  "HS512",
]);

const ALGORITHM_MAP: Record<JWTAlgorithm, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

const MIN_SECRET_BYTES = 32; // 256-bit

export interface JWTPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface JWTOptions {
  algorithm?: JWTAlgorithm;
  issuer?: string;
  audience?: string;
  expiresIn?: number; // 秒
}

export interface JWTManager {
  sign(
    payload: JWTPayload,
    secret: string,
    options?: JWTOptions,
  ): Promise<string>;
  verify(
    token: string,
    secret: string,
    options?: JWTOptions,
  ): Promise<JWTPayload>;
  decode(token: string): JWTPayload | null;
}

function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

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

function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}

function validateSecret(secret: string): void {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `Secret must be at least ${MIN_SECRET_BYTES} bytes (256-bit), got ${bytes.length} bytes`,
    );
  }
}

async function importKey(
  secret: string,
  algorithm: JWTAlgorithm,
): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: ALGORITHM_MAP[algorithm] },
    false,
    ["sign", "verify"],
  );
}

export function createJWT(): JWTManager {
  return {
    async sign(
      payload: JWTPayload,
      secret: string,
      options: JWTOptions = {},
    ): Promise<string> {
      validateSecret(secret);

      const algorithm = options.algorithm ?? "HS256";
      if (!ALGORITHM_WHITELIST.has(algorithm)) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const now = Math.floor(Date.now() / 1000);
      const finalPayload: JWTPayload = {
        ...payload,
        iat: now,
      };

      if (options.issuer) {
        finalPayload.iss = options.issuer;
      }
      if (options.audience) {
        finalPayload.aud = options.audience;
      }
      if (options.expiresIn != null) {
        finalPayload.exp = now + options.expiresIn;
      }

      const header = base64urlEncodeString(
        JSON.stringify({ alg: algorithm, typ: "JWT" }),
      );
      const body = base64urlEncodeString(JSON.stringify(finalPayload));
      const signingInput = `${header}.${body}`;

      const key = await importKey(secret, algorithm);
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput),
      );

      const sig = base64urlEncode(new Uint8Array(signature));
      return `${signingInput}.${sig}`;
    },

    async verify(
      token: string,
      secret: string,
      options: JWTOptions = {},
    ): Promise<JWTPayload> {
      validateSecret(secret);

      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new UnauthorizedError("Invalid token format");
      }

      const [headerPart, payloadPart, signaturePart] = parts as [
        string,
        string,
        string,
      ];

      // Decode and validate header
      let header: { alg?: string; typ?: string };
      try {
        header = JSON.parse(base64urlDecodeString(headerPart));
      } catch {
        throw new UnauthorizedError("Invalid token header");
      }

      if (!header.alg || !ALGORITHM_WHITELIST.has(header.alg)) {
        throw new UnauthorizedError(
          `Unsupported algorithm: ${header.alg ?? "none"}`,
        );
      }

      const algorithm = header.alg as JWTAlgorithm;
      const expectedAlgorithm = options.algorithm ?? algorithm;
      if (algorithm !== expectedAlgorithm) {
        throw new UnauthorizedError(
          `Algorithm mismatch: expected ${expectedAlgorithm}, got ${algorithm}`,
        );
      }

      // Verify signature using crypto.subtle.verify (constant-time)
      const key = await importKey(secret, algorithm);
      const signingInput = new TextEncoder().encode(
        `${headerPart}.${payloadPart}`,
      );
      const signature = base64urlDecode(signaturePart);

      const valid = await crypto.subtle.verify("HMAC", key, signature, signingInput);
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
      if (options.issuer && payload.iss !== options.issuer) {
        throw new UnauthorizedError(
          `Issuer mismatch: expected ${options.issuer}, got ${payload.iss}`,
        );
      }

      // Check audience
      if (options.audience && payload.aud !== options.audience) {
        throw new UnauthorizedError(
          `Audience mismatch: expected ${options.audience}, got ${payload.aud}`,
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
