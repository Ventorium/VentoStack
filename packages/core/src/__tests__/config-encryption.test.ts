import { describe, test, expect } from "bun:test";
import { createConfigEncryptor } from "../config-encryption";

describe("createConfigEncryptor", () => {
  const key = "a".repeat(32); // 32-byte key for AES-256

  test("encrypt returns encrypted string", async () => {
    const enc = createConfigEncryptor({ key });
    const result = await enc.encrypt("hello world");
    expect(result).toStartWith("ENC:");
    expect(result).not.toBe("hello world");
  });

  test("decrypt returns original value", async () => {
    const enc = createConfigEncryptor({ key });
    const encrypted = await enc.encrypt("hello world");
    const decrypted = await enc.decrypt(encrypted);
    expect(decrypted).toBe("hello world");
  });

  test("isEncrypted identifies encrypted values", () => {
    const enc = createConfigEncryptor({ key });
    expect(enc.isEncrypted("ENC:abc")).toBe(true);
    expect(enc.isEncrypted("plain text")).toBe(false);
    expect(enc.isEncrypted("")).toBe(false);
  });

  test("encrypt produces different ciphertext each time", async () => {
    const enc = createConfigEncryptor({ key });
    const a = await enc.encrypt("same");
    const b = await enc.encrypt("same");
    expect(a).not.toBe(b); // Different IV each time
  });

  test("decrypt with wrong key fails", async () => {
    const enc1 = createConfigEncryptor({ key: "a".repeat(32) });
    const enc2 = createConfigEncryptor({ key: "b".repeat(32) });
    const encrypted = await enc1.encrypt("secret");
    expect(async () => await enc2.decrypt(encrypted)).toThrow();
  });

  test("decrypt non-encrypted value throws", () => {
    const enc = createConfigEncryptor({ key });
    expect(async () => await enc.decrypt("not encrypted")).toThrow();
  });

  test("roundtrip with special characters", async () => {
    const enc = createConfigEncryptor({ key });
    const value = "postgres://user:p@ss:word@host:5432/db?opt=1&foo=bar";
    expect(await enc.decrypt(await enc.encrypt(value))).toBe(value);
  });

  test("roundtrip with unicode", async () => {
    const enc = createConfigEncryptor({ key });
    const value = "你好世界 🌍";
    expect(await enc.decrypt(await enc.encrypt(value))).toBe(value);
  });
});
