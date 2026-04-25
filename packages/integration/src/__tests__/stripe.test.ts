import { describe, expect, test } from "bun:test";
import { createStripeVerifier } from "../providers/stripe";
import { hmacSign } from "@ventostack/webhook";

describe("createStripeVerifier", () => {
  const secret = "whsec_test_secret";
  const verifier = createStripeVerifier();

  test("validates correct Stripe signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"type":"payment_intent.succeeded","data":{}}';
    const signedPayload = `${timestamp}.${body}`;
    const signature = hmacSign(signedPayload, secret, "sha256");

    const result = await verifier.verify(body, {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    }, { secret });

    expect(result.valid).toBe(true);
    expect(result.metadata?.timestamp).toBe(timestamp);
  });

  test("rejects expired timestamp", async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 分钟前
    const body = '{"type":"test"}';
    const signedPayload = `${oldTimestamp}.${body}`;
    const signature = hmacSign(signedPayload, secret, "sha256");

    const result = await verifier.verify(body, {
      "stripe-signature": `t=${oldTimestamp},v1=${signature}`,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Timestamp outside tolerance");
  });

  test("rejects invalid signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const result = await verifier.verify("body", {
      "stripe-signature": `t=${timestamp},v1=invalid_signature`,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing header", async () => {
    const result = await verifier.verify("body", {}, { secret });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  test("rejects missing secret", async () => {
    const result = await verifier.verify("body", { "stripe-signature": "t=1,v1=x" }, {});
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing secret");
  });

  test("supports multiple v1 signatures (key rotation)", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"type":"test"}';
    const signedPayload = `${timestamp}.${body}`;
    const validSig = hmacSign(signedPayload, secret, "sha256");
    const oldSig = "old_signature_value_here";

    const result = await verifier.verify(body, {
      "stripe-signature": `t=${timestamp},v1=${oldSig},v1=${validSig}`,
    }, { secret });

    expect(result.valid).toBe(true);
  });

  test("custom timestamp tolerance", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 300; // 5 分钟前
    const body = '{"type":"test"}';
    const signedPayload = `${timestamp}.${body}`;
    const signature = hmacSign(signedPayload, secret, "sha256");

    // 默认 5 分钟容差，刚好超时
    const result1 = await verifier.verify(body, {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    }, { secret, timestampTolerance: 4 * 60 * 1000 });
    expect(result1.valid).toBe(false);

    // 10 分钟容差，通过
    const result2 = await verifier.verify(body, {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    }, { secret, timestampTolerance: 10 * 60 * 1000 });
    expect(result2.valid).toBe(true);
  });
});
