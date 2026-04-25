import { describe, expect, test } from "bun:test";
import { createWeChatPayVerifier } from "../providers/wechat-pay";

async function generateTestRsaKeys() {
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
  const privateKeyDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateKeyDer).toString("base64")}\n-----END PRIVATE KEY-----`;
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKeyDer).toString("base64")}\n-----END PUBLIC KEY-----`;
  return { privateKeyPem, publicKeyPem, privateKey: keyPair.privateKey };
}

async function rsaSign(privateKey: CryptoKey, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(message));
  return Buffer.from(sig).toString("base64");
}

describe("createWeChatPayVerifier", () => {
  const verifier = createWeChatPayVerifier();

  test("validates correct WeChat Pay signature", async () => {
    const keys = await generateTestRsaKeys();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const body = '{"id":"notify","create_time":"2024-01-01T00:00:00+08:00"}';

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const signature = await rsaSign(keys.privateKey, message);

    const result = await verifier.verify(body, {
      "wechatpay-signature": signature,
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": nonce,
      "wechatpay-serial": "test-serial-001",
    }, { publicKey: keys.publicKeyPem });

    expect(result.valid).toBe(true);
    expect(result.metadata?.serial).toBe("test-serial-001");
  });

  test("supports multiple certificates via config.extra.certificates", async () => {
    const keys = await generateTestRsaKeys();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "nonce-123";
    const body = '{"id":"notify"}';

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const signature = await rsaSign(keys.privateKey, message);

    const result = await verifier.verify(body, {
      "wechatpay-signature": signature,
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": nonce,
      "wechatpay-serial": "serial-002",
    }, {
      publicKey: "wrong-key",
      extra: {
        certificates: {
          "serial-001": "wrong-key",
          "serial-002": keys.publicKeyPem,
        },
      },
    });

    expect(result.valid).toBe(true);
  });

  test("rejects wrong public key", async () => {
    const keys = await generateTestRsaKeys();
    const wrongKeys = await generateTestRsaKeys();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "nonce-123";
    const body = '{"id":"notify"}';

    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const signature = await rsaSign(keys.privateKey, message);

    const result = await verifier.verify(body, {
      "wechatpay-signature": signature,
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": nonce,
    }, { publicKey: wrongKeys.publicKeyPem });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing signature header", async () => {
    const result = await verifier.verify("body", {
      "wechatpay-timestamp": "123",
      "wechatpay-nonce": "abc",
    }, { publicKey: "key" });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing timestamp header", async () => {
    const result = await verifier.verify("body", {
      "wechatpay-signature": "sig",
      "wechatpay-nonce": "abc",
    }, { publicKey: "key" });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing nonce header", async () => {
    const result = await verifier.verify("body", {
      "wechatpay-signature": "sig",
      "wechatpay-timestamp": "123",
    }, { publicKey: "key" });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing public key", async () => {
    const result = await verifier.verify("body", {
      "wechatpay-signature": "sig",
      "wechatpay-timestamp": "123",
      "wechatpay-nonce": "abc",
    }, {});

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing public key");
  });
});
