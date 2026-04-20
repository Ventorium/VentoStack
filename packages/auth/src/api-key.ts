// @aeron/auth - API Key 管理
// API Key 必须哈希后存储，不允许明文持久化

export interface ApiKeyManager {
  generate(metadata?: Record<string, unknown>): Promise<{
    key: string;
    hash: string;
    metadata?: Record<string, unknown>;
  }>;
  hash(key: string): Promise<string>;
  verify(key: string, storedHash: string): Promise<boolean>;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Hash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return uint8ArrayToHex(new Uint8Array(hashBuffer));
}

// Constant-time comparison using crypto.subtle
async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) return false;

  // Use HMAC with a fixed key for constant-time comparison
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32), // fixed zero key, just for comparison
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigA = await crypto.subtle.sign("HMAC", key, aBytes);
  const sigB = await crypto.subtle.sign("HMAC", key, bBytes);

  const viewA = new Uint8Array(sigA);
  const viewB = new Uint8Array(sigB);

  // Both HMAC results are always same length
  let result = 0;
  for (let i = 0; i < viewA.length; i++) {
    result |= viewA[i]! ^ viewB[i]!;
  }
  return result === 0;
}

function generatePrefix(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return uint8ArrayToHex(bytes);
}

export function createApiKeyManager(): ApiKeyManager {
  return {
    async generate(
      metadata?: Record<string, unknown>,
    ): Promise<{
      key: string;
      hash: string;
      metadata?: Record<string, unknown>;
    }> {
      const prefix = generatePrefix();
      const uuid = crypto.randomUUID();
      const key = `ak_${prefix}_${uuid}`;
      const hash = await sha256Hash(key);

      return {
        key,
        hash,
        ...(metadata ? { metadata } : {}),
      };
    },

    async hash(key: string): Promise<string> {
      return sha256Hash(key);
    },

    async verify(key: string, storedHash: string): Promise<boolean> {
      const keyHash = await sha256Hash(key);
      return constantTimeEqual(keyHash, storedHash);
    },
  };
}
