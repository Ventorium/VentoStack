import { describe, test, expect } from "bun:test";
import { createApiKeyManager } from "../api-key";

describe("createApiKeyManager", () => {
  const manager = createApiKeyManager();

  describe("generate", () => {
    test("generates a key with ak_ prefix", async () => {
      const result = await manager.generate();
      expect(result.key).toMatch(/^ak_[0-9a-f]+_/);
    });

    test("generates unique keys", async () => {
      const a = await manager.generate();
      const b = await manager.generate();
      expect(a.key).not.toBe(b.key);
      expect(a.hash).not.toBe(b.hash);
    });

    test("returns a SHA-256 hash (64 hex chars)", async () => {
      const result = await manager.generate();
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("includes metadata when provided", async () => {
      const result = await manager.generate({ name: "test-key", env: "prod" });
      expect(result.metadata).toEqual({ name: "test-key", env: "prod" });
    });

    test("omits metadata when not provided", async () => {
      const result = await manager.generate();
      expect(result.metadata).toBeUndefined();
    });
  });

  describe("hash", () => {
    test("returns consistent hash for same input", async () => {
      const h1 = await manager.hash("test-key");
      const h2 = await manager.hash("test-key");
      expect(h1).toBe(h2);
    });

    test("returns different hashes for different inputs", async () => {
      const h1 = await manager.hash("key-a");
      const h2 = await manager.hash("key-b");
      expect(h1).not.toBe(h2);
    });

    test("returns 64 character hex string", async () => {
      const h = await manager.hash("anything");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("verify", () => {
    test("returns true for matching key and hash", async () => {
      const { key, hash } = await manager.generate();
      const result = await manager.verify(key, hash);
      expect(result).toBe(true);
    });

    test("returns false for wrong key", async () => {
      const { hash } = await manager.generate();
      const result = await manager.verify("wrong-key", hash);
      expect(result).toBe(false);
    });

    test("returns false for wrong hash", async () => {
      const { key } = await manager.generate();
      const result = await manager.verify(key, "0".repeat(64));
      expect(result).toBe(false);
    });

    test("verify is consistent with hash", async () => {
      const key = "my-custom-key";
      const hash = await manager.hash(key);
      const result = await manager.verify(key, hash);
      expect(result).toBe(true);
    });
  });
});
