import { describe, expect, test } from "bun:test";
import { hmacSign } from "../crypto";
import { createGenericHmacVerifier, createInboundVerifier } from "../inbound";

const now = () => String(Date.now());

describe("createGenericHmacVerifier", () => {
  test("validates correct HMAC signature", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = hmacSign(body, secret, "sha256");

    const result = await verifier.verify(
      body,
      { "x-signature": signature, "x-timestamp": now() },
      { secret },
    );
    expect(result.valid).toBe(true);
  });

  test("rejects invalid signature", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify(
      "body",
      { "x-signature": "wrong", "x-timestamp": now() },
      { secret: "s" },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing header", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify("body", { "x-timestamp": now() }, { secret: "s" });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing secret", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify(
      "body",
      { "x-signature": "sig", "x-timestamp": now() },
      {},
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing secret");
  });

  test("supports sha256= prefix format", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = `sha256=${hmacSign(body, secret, "sha256")}`;

    const result = await verifier.verify(
      body,
      { "x-signature": signature, "x-timestamp": now() },
      { secret },
    );
    expect(result.valid).toBe(true);
  });

  test("rejects missing timestamp header (replay protection)", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = hmacSign(body, secret, "sha256");

    const result = await verifier.verify(body, { "x-signature": signature }, { secret });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing x-timestamp");
  });

  test("rejects stale timestamp outside tolerance window", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = hmacSign(body, secret, "sha256");
    const staleTs = String(Date.now() - 10 * 60 * 1000); // 10 分钟前

    const result = await verifier.verify(
      body,
      { "x-signature": signature, "x-timestamp": staleTs },
      { secret },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Timestamp out of tolerance");
  });

  test("honors custom timestampTolerance and can be disabled with 0", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = hmacSign(body, secret, "sha256");
    const staleTs = String(Date.now() - 10 * 60 * 1000);

    // 自定义大容差 → 通过
    const wide = await verifier.verify(
      body,
      { "x-signature": signature, "x-timestamp": staleTs },
      { secret, timestampTolerance: 15 * 60 * 1000 },
    );
    expect(wide.valid).toBe(true);

    // 显式关闭 → 不要求时间戳头
    const disabled = await verifier.verify(body, { "x-signature": signature }, { secret, timestampTolerance: 0 });
    expect(disabled.valid).toBe(true);
  });
});

describe("createInboundVerifier", () => {
  test("returns WebhookEvent on valid signature", async () => {
    const verifier = createInboundVerifier({
      provider: createGenericHmacVerifier("sha256", "x-signature"),
      config: { secret: "my-secret" },
    });

    const body = '{"event":"order.created","orderId":"123"}';
    const signature = hmacSign(body, "my-secret", "sha256");
    const event = await verifier.verifyAndConvert(body, {
      "x-signature": signature,
      "x-timestamp": now(),
    });

    expect(event.id).toBeDefined();
    expect(event.source).toBe("generic-hmac-sha256");
    expect(event.type).toBe("webhook.received");
    expect(event.payload).toEqual({ event: "order.created", orderId: "123" });
    expect(event.timestamp).toBeGreaterThan(0);
  });

  test("throws on invalid signature", async () => {
    const verifier = createInboundVerifier({
      provider: createGenericHmacVerifier("sha256", "x-signature"),
      config: { secret: "my-secret" },
    });

    await expect(
      verifier.verifyAndConvert("body", { "x-signature": "wrong", "x-timestamp": now() }),
    ).rejects.toThrow("Webhook verification failed");
  });

  test("uses custom source name", async () => {
    const verifier = createInboundVerifier({
      provider: createGenericHmacVerifier("sha256", "x-signature"),
      config: { secret: "my-secret" },
      source: "my-app",
    });

    const body = '{"data":1}';
    const signature = hmacSign(body, "my-secret", "sha256");
    const event = await verifier.verifyAndConvert(body, {
      "x-signature": signature,
      "x-timestamp": now(),
    });

    expect(event.source).toBe("my-app");
  });

  test("rejects replay with duplicate nonce when nonceChecker provided", async () => {
    const seen = new Set<string>();
    const nonceChecker = async (nonce: string) => {
      if (seen.has(nonce)) return false;
      seen.add(nonce);
      return true;
    };

    const verifier = createInboundVerifier({
      provider: createGenericHmacVerifier("sha256", "x-signature"),
      config: { secret: "my-secret" },
      nonceChecker,
    });

    const body = '{"event":"payment.completed","amount":100}';
    const signature = hmacSign(body, "my-secret", "sha256");
    const headers = { "x-signature": signature, "x-timestamp": now(), "x-webhook-nonce": "n-001" };

    // 首次 → 通过
    await expect(verifier.verifyAndConvert(body, headers)).resolves.toBeTruthy();
    // 重放同一 nonce → 拒绝
    await expect(verifier.verifyAndConvert(body, headers)).rejects.toThrow("Duplicate nonce");
  });

  test("requires nonce header when nonceChecker provided", async () => {
    const verifier = createInboundVerifier({
      provider: createGenericHmacVerifier("sha256", "x-signature"),
      config: { secret: "my-secret" },
      nonceChecker: async () => true,
    });

    const body = '{"event":"test"}';
    const signature = hmacSign(body, "my-secret", "sha256");
    await expect(
      verifier.verifyAndConvert(body, { "x-signature": signature, "x-timestamp": now() }),
    ).rejects.toThrow("Missing x-webhook-nonce");
  });

  test("uses eventType from provider result", async () => {
    const customProvider = {
      provider: "custom",
      async verify() {
        return { valid: true, eventType: "custom.event" };
      },
    };

    const verifier = createInboundVerifier({
      provider: customProvider,
      config: {},
    });

    const event = await verifier.verifyAndConvert("{}", {});
    expect(event.type).toBe("custom.event");
  });

  test("handles non-JSON body as string payload", async () => {
    const customProvider = {
      provider: "custom",
      async verify() {
        return { valid: true };
      },
    };

    const verifier = createInboundVerifier({
      provider: customProvider,
      config: {},
    });

    const event = await verifier.verifyAndConvert("plain text body", {});
    expect(event.payload).toBe("plain text body");
  });
});
