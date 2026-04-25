import { describe, expect, test } from "bun:test";
import { createAlipayVerifier } from "../providers/alipay";

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
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKeyDer).toString("base64")}\n-----END PUBLIC KEY-----`;
  return { publicKeyPem, privateKey: keyPair.privateKey };
}

async function rsaSign(privateKey: CryptoKey, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(message));
  return Buffer.from(sig).toString("base64");
}

describe("createAlipayVerifier", () => {
  const verifier = createAlipayVerifier();

  test("validates correct Alipay signature", async () => {
    const keys = await generateTestRsaKeys();
    const params: Record<string, string> = {
      app_id: "2021000000000000",
      trade_no: "2024010100000000",
      out_trade_no: "order-001",
      trade_status: "TRADE_SUCCESS",
      total_amount: "100.00",
      notify_type: "trade_status_sync",
    };

    // 构造待签名字符串: 排除 sign/sign_type/空值，按 key 字典排序
    const sortedKeys = Object.keys(params).filter((k) => params[k] !== "").sort();
    const signString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
    const sign = await rsaSign(keys.privateKey, signString);

    const bodyParams = {
      ...params,
      sign,
      sign_type: "RSA2",
    };

    const result = await verifier.verify("", {}, {
      publicKey: keys.publicKeyPem,
      extra: { bodyParams },
    });

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("trade_status_sync");
    expect(result.metadata?.tradeNo).toBe("2024010100000000");
    expect(result.metadata?.tradeStatus).toBe("TRADE_SUCCESS");
  });

  test("excludes sign, sign_type, and empty values from signing", async () => {
    const keys = await generateTestRsaKeys();
    const params: Record<string, string> = {
      app_id: "2021000000000000",
      trade_no: "2024010100000000",
      empty_field: "",
    };

    const sortedKeys = Object.keys(params).filter((k) => params[k] !== "").sort();
    const signString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
    const sign = await rsaSign(keys.privateKey, signString);

    const bodyParams = {
      ...params,
      sign,
      sign_type: "RSA2",
    };

    const result = await verifier.verify("", {}, {
      publicKey: keys.publicKeyPem,
      extra: { bodyParams },
    });

    expect(result.valid).toBe(true);
  });

  test("rejects wrong public key", async () => {
    const keys = await generateTestRsaKeys();
    const wrongKeys = await generateTestRsaKeys();

    const params: Record<string, string> = {
      app_id: "2021000000000000",
      trade_no: "2024010100000000",
    };

    const sortedKeys = Object.keys(params).sort();
    const signString = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
    const sign = await rsaSign(keys.privateKey, signString);

    const bodyParams = { ...params, sign, sign_type: "RSA2" };

    const result = await verifier.verify("", {}, {
      publicKey: wrongKeys.publicKeyPem,
      extra: { bodyParams },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing public key", async () => {
    const result = await verifier.verify("", {}, {
      extra: { bodyParams: { sign: "test" } },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing public key");
  });

  test("rejects missing bodyParams", async () => {
    const result = await verifier.verify("", {}, {
      publicKey: "key",
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing bodyParams");
  });

  test("rejects missing sign parameter", async () => {
    const result = await verifier.verify("", {}, {
      publicKey: "key",
      extra: { bodyParams: { app_id: "123" } },
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing sign parameter");
  });
});
