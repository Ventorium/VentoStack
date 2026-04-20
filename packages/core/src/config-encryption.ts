// @aeron/core - 敏感配置加密存储

export interface ConfigEncryptionOptions {
  /** 加密密钥（至少 32 字节） */
  key: string;
  /** 加密算法 */
  algorithm?: string;
}

export interface ConfigEncryptor {
  encrypt(value: string): Promise<string>;
  decrypt(encrypted: string): Promise<string>;
  isEncrypted(value: string): boolean;
}

const ENCRYPTED_PREFIX = "ENC:";

/**
 * 创建配置加密器
 * 使用 AES-256-GCM 加密敏感配置值
 */
export function createConfigEncryptor(options: ConfigEncryptionOptions): ConfigEncryptor {
  const keyBytes = new TextEncoder().encode(options.key.padEnd(32, "0").slice(0, 32));

  async function getKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  return {
    async encrypt(value: string): Promise<string> {
      const key = await getKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(value);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      const b64 = btoa(String.fromCharCode(...combined));
      return `${ENCRYPTED_PREFIX}${b64}`;
    },

    async decrypt(encrypted: string): Promise<string> {
      if (!encrypted.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error("Value is not encrypted");
      }
      const b64 = encrypted.slice(ENCRYPTED_PREFIX.length);
      const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const key = await getKey();
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return new TextDecoder().decode(decrypted);
    },

    isEncrypted(value: string): boolean {
      return value.startsWith(ENCRYPTED_PREFIX);
    },
  };
}
