import { describe, expect, test } from "bun:test";
import { createGenericHmacVerifier, createInboundVerifier } from "../inbound";
import { hmacSign } from "../crypto";

describe("createGenericHmacVerifier", () => {
  test("validates correct HMAC signature", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = hmacSign(body, secret, "sha256");

    const result = await verifier.verify(body, { "x-signature": signature }, { secret });
    expect(result.valid).toBe(true);
  });

  test("rejects invalid signature", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify("body", { "x-signature": "wrong" }, { secret: "s" });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing header", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify("body", {}, { secret: "s" });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing secret", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const result = await verifier.verify("body", { "x-signature": "sig" }, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing secret");
  });

  test("supports sha256= prefix format", async () => {
    const verifier = createGenericHmacVerifier("sha256", "x-signature");
    const secret = "my-secret";
    const body = '{"event":"test"}';
    const signature = `sha256=${hmacSign(body, secret, "sha256")}`;

    const result = await verifier.verify(body, { "x-signature": signature }, { secret });
    expect(result.valid).toBe(true);
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
    const event = await verifier.verifyAndConvert(body, { "x-signature": signature });

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
      verifier.verifyAndConvert("body", { "x-signature": "wrong" }),
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
    const event = await verifier.verifyAndConvert(body, { "x-signature": signature });

    expect(event.source).toBe("my-app");
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
