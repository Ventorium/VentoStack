import { describe, expect, test } from "bun:test";
import { createGitHubVerifier } from "../providers/github";
import { hmacSign } from "@ventostack/webhook";

describe("createGitHubVerifier", () => {
  const secret = "It's a Secret to Everybody";
  const verifier = createGitHubVerifier();

  test("validates correct GitHub signature", async () => {
    const body = "Hello, World!";
    const signature = hmacSign(body, secret, "sha256");

    const result = await verifier.verify(body, {
      "x-hub-signature-256": `sha256=${signature}`,
    }, { secret });

    expect(result.valid).toBe(true);
  });

  // 官方测试向量: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  test("matches GitHub's official test vector", async () => {
    const body = "Hello, World!";
    const signature = "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

    const result = await verifier.verify(body, {
      "x-hub-signature-256": `sha256=${signature}`,
    }, { secret });

    expect(result.valid).toBe(true);
  });

  test("extracts event type from X-GitHub-Event", async () => {
    const body = '{"action":"opened"}';
    const signature = hmacSign(body, secret, "sha256");

    const result = await verifier.verify(body, {
      "x-hub-signature-256": `sha256=${signature}`,
      "x-github-event": "issues",
    }, { secret });

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("github.issues");
  });

  test("rejects tampered body", async () => {
    const signature = hmacSign("original", secret, "sha256");

    const result = await verifier.verify("tampered", {
      "x-hub-signature-256": `sha256=${signature}`,
    }, { secret });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing header", async () => {
    const result = await verifier.verify("body", {}, { secret });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid format", async () => {
    const result = await verifier.verify("body", {
      "x-hub-signature-256": "invalid-no-prefix",
    }, { secret });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Invalid signature format");
  });
});
