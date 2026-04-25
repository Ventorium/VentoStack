import { describe, expect, test } from "bun:test";
import { exponentialBackoff, hmacSign, rsaSha256Verify, timingSafeEqual } from "../crypto";

describe("hmacSign", () => {
  test("produces deterministic hex signature", () => {
    const sig1 = hmacSign("hello", "secret", "sha256");
    const sig2 = hmacSign("hello", "secret", "sha256");
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different algorithms produce different output", () => {
    const sha256 = hmacSign("hello", "secret", "sha256");
    const sha512 = hmacSign("hello", "secret", "sha512");
    expect(sha256).not.toBe(sha512);
  });

  test("different secrets produce different output", () => {
    const a = hmacSign("hello", "secret-a", "sha256");
    const b = hmacSign("hello", "secret-b", "sha256");
    expect(a).not.toBe(b);
  });
});

describe("timingSafeEqual", () => {
  test("returns true for equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  test("returns false for different strings", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  test("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  test("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("exponentialBackoff", () => {
  test("increases with attempt number", () => {
    const base = 1000;
    const max = 60000;
    const d0 = exponentialBackoff(0, base, max);
    const d1 = exponentialBackoff(1, base, max);
    const d2 = exponentialBackoff(2, base, max);
    // d0 ≈ 1000 + jitter, d1 ≈ 2000 + jitter, d2 ≈ 4000 + jitter
    expect(d1).toBeGreaterThan(d0 * 0.9);
    expect(d2).toBeGreaterThan(d1 * 0.9);
  });

  test("caps at maxInterval", () => {
    const delay = exponentialBackoff(100, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe("rsaSha256Verify", () => {
  test("returns false for invalid inputs", async () => {
    const result = await rsaSha256Verify("data", "invalid-sig", "invalid-key");
    expect(result).toBe(false);
  });

  test("verifies a real RSA-SHA256 signature round-trip", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );

    const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKeyDer).toString("base64")}\n-----END PUBLIC KEY-----`;

    const message = "test message for RSA verification";
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      encoder.encode(message),
    );
    const signatureB64 = Buffer.from(signature).toString("base64");

    // 正确签名应该通过
    const valid = await rsaSha256Verify(message, signatureB64, publicKeyPem);
    expect(valid).toBe(true);

    // 篡改消息应该失败
    const tampered = await rsaSha256Verify("tampered message", signatureB64, publicKeyPem);
    expect(tampered).toBe(false);

    // 错误签名应该失败
    const wrongSig = await rsaSha256Verify(message, "wrongbase64==", publicKeyPem);
    expect(wrongSig).toBe(false);
  });
});
