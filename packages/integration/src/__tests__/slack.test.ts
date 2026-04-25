import { describe, expect, test } from "bun:test";
import { createSlackVerifier } from "../providers/slack";
import { hmacSign } from "@ventostack/webhook";

describe("createSlackVerifier", () => {
  const secret = "8f742231b10e1498f0ac3ebcbegging-your-pardon";
  const verifier = createSlackVerifier();

  test("validates correct Slack signature", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = "payload=%7B%22type%22%3A%22event_callback%22%7D";
    const sigBaseString = `v0:${timestamp}:${body}`;
    const signature = `v0=${hmacSign(sigBaseString, secret, "sha256")}`;

    const result = await verifier.verify(body, {
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    }, { secret });

    expect(result.valid).toBe(true);
  });

  test("rejects expired timestamp", async () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 分钟前
    const body = "payload=test";
    const sigBaseString = `v0:${oldTimestamp}:${body}`;
    const signature = `v0=${hmacSign(sigBaseString, secret, "sha256")}`;

    const result = await verifier.verify(body, {
      "x-slack-signature": signature,
      "x-slack-request-timestamp": oldTimestamp,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Timestamp outside tolerance");
  });

  test("rejects invalid signature", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));

    const result = await verifier.verify("body", {
      "x-slack-signature": "v0=invalid",
      "x-slack-request-timestamp": timestamp,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing headers", async () => {
    const result = await verifier.verify("body", {}, { secret });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid format", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));

    const result = await verifier.verify("body", {
      "x-slack-signature": "invalid-no-v0-prefix",
      "x-slack-request-timestamp": timestamp,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature format");
  });
});
