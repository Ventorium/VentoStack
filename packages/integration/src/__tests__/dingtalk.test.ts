import { describe, expect, test } from "bun:test";
import { createDingTalkVerifier } from "../providers/dingtalk";

describe("createDingTalkVerifier", () => {
  const secret = "SEC_test_secret";
  const verifier = createDingTalkVerifier();

  test("validates correct DingTalk signature", async () => {
    const timestamp = String(Date.now());
    const stringToSign = `${timestamp}\n${secret}`;
    const hasher = new Bun.CryptoHasher("sha256", secret);
    hasher.update(stringToSign);
    const sign = Buffer.from(hasher.digest()).toString("base64");
    const encodedSign = encodeURIComponent(sign);

    const result = await verifier.verify("", {}, {
      secret,
      extra: { timestamp, sign: encodedSign },
    });

    expect(result.valid).toBe(true);
  });

  test("rejects expired timestamp", async () => {
    const oldTimestamp = String(Date.now() - 2 * 60 * 60 * 1000); // 2 小时前
    const stringToSign = `${oldTimestamp}\n${secret}`;
    const hasher = new Bun.CryptoHasher("sha256", secret);
    hasher.update(stringToSign);
    const sign = Buffer.from(hasher.digest()).toString("base64");

    const result = await verifier.verify("", {}, {
      secret,
      extra: { timestamp: oldTimestamp, sign: encodeURIComponent(sign) },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Timestamp outside tolerance");
  });

  test("rejects wrong secret", async () => {
    const timestamp = String(Date.now());
    const stringToSign = `${timestamp}\n${secret}`;
    const hasher = new Bun.CryptoHasher("sha256", secret);
    hasher.update(stringToSign);
    const sign = Buffer.from(hasher.digest()).toString("base64");

    const result = await verifier.verify("", {}, {
      secret: "SEC_wrong_secret",
      extra: { timestamp, sign: encodeURIComponent(sign) },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing extra params", async () => {
    const result = await verifier.verify("", {}, { secret });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing secret", async () => {
    const result = await verifier.verify("", {}, {
      extra: { timestamp: "123", sign: "abc" },
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing secret");
  });
});
