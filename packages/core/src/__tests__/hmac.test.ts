import { describe, test, expect } from "bun:test";
import { createHMACSigner } from "../middlewares/hmac";

const TEST_SECRET = "test-secret-key-at-least-32-chars!";

function makeSignedRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string,
): Request {
  const url = `http://localhost${path}`;
  return new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ?? undefined,
  });
}

describe("createHMACSigner", () => {
  test("sign produces valid signature, timestamp, and nonce", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const result = await signer.sign("POST", "/api/test", "hello");
    expect(result.signature).toMatch(/^[0-9a-f]+$/);
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.nonce).toBeTruthy();
  });

  test("verify accepts valid signed request", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const { signature, timestamp, nonce } = await signer.sign(
      "POST",
      "/api/data",
      '{"key":"value"}',
    );
    const req = makeSignedRequest("POST", "/api/data", {
      "x-signature": signature,
      "x-timestamp": String(timestamp),
      "x-nonce": nonce,
    }, '{"key":"value"}');
    const result = await signer.verify(req);
    expect(result.valid).toBe(true);
  });

  test("verify rejects missing signature header", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const req = makeSignedRequest("GET", "/api/test", {});
    const result = await signer.verify(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing signature");
  });

  test("verify rejects expired timestamp", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET, maxAge: 1000 });
    const oldTimestamp = Date.now() - 60_000; // 60 seconds ago
    const { signature, nonce } = await signer.sign(
      "POST",
      "/api/test",
      "",
      oldTimestamp,
    );
    const req = makeSignedRequest("POST", "/api/test", {
      "x-signature": signature,
      "x-timestamp": String(oldTimestamp),
      "x-nonce": nonce,
    });
    const result = await signer.verify(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  test("verify rejects duplicate nonce", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const { signature, timestamp, nonce } = await signer.sign(
      "POST",
      "/api/test",
      "body",
    );
    const headers = {
      "x-signature": signature,
      "x-timestamp": String(timestamp),
      "x-nonce": nonce,
    };

    // First request should pass
    const req1 = makeSignedRequest("POST", "/api/test", headers, "body");
    const result1 = await signer.verify(req1);
    expect(result1.valid).toBe(true);

    // Same nonce should be rejected
    const req2 = makeSignedRequest("POST", "/api/test", headers, "body");
    const result2 = await signer.verify(req2);
    expect(result2.valid).toBe(false);
    expect(result2.reason).toContain("Nonce already used");
  });

  test("verify rejects tampered body", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const { signature, timestamp, nonce } = await signer.sign(
      "POST",
      "/api/test",
      "original",
    );
    const req = makeSignedRequest("POST", "/api/test", {
      "x-signature": signature,
      "x-timestamp": String(timestamp),
      "x-nonce": nonce,
    }, "tampered");
    const result = await signer.verify(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("mismatch");
  });

  test("verify rejects tampered path", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const { signature, timestamp, nonce } = await signer.sign(
      "GET",
      "/api/safe",
      "",
    );
    const req = makeSignedRequest("GET", "/api/admin", {
      "x-signature": signature,
      "x-timestamp": String(timestamp),
      "x-nonce": nonce,
    });
    const result = await signer.verify(req);
    expect(result.valid).toBe(false);
  });

  test("middleware returns 401 on invalid signature", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const mw = signer.middleware();
    const { createContext } = await import("../context");
    const req = new Request("http://localhost/api/test", { method: "GET" });
    const ctx = createContext(req);
    const response = await mw(ctx, () =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("middleware passes valid request through", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const mw = signer.middleware();
    const { signature, timestamp, nonce } = await signer.sign(
      "POST",
      "/api/test",
      "data",
    );
    const { createContext } = await import("../context");
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "x-signature": signature,
        "x-timestamp": String(timestamp),
        "x-nonce": nonce,
      },
      body: "data",
    });
    const ctx = createContext(req);
    const response = await mw(ctx, () =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    expect(response.status).toBe(200);
  });

  test("supports custom algorithm SHA-512", async () => {
    const signer = createHMACSigner({
      secret: TEST_SECRET,
      algorithm: "SHA-512",
    });
    const result = await signer.sign("GET", "/test", "");
    // SHA-512 produces 128 hex chars
    expect(result.signature.length).toBe(128);
  });

  test("verify rejects missing timestamp", async () => {
    const signer = createHMACSigner({ secret: TEST_SECRET });
    const req = makeSignedRequest("GET", "/api/test", {
      "x-signature": "abc",
    });
    const result = await signer.verify(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing timestamp");
  });
});
