import { describe, expect, test } from "bun:test";
import { createShopifyVerifier } from "../providers/shopify";

describe("createShopifyVerifier", () => {
  const secret = "shopify_app_secret";
  const verifier = createShopifyVerifier();

  function computeShopifyHmac(body: string, secret: string): string {
    const hasher = new Bun.CryptoHasher("sha256", secret);
    hasher.update(body);
    return Buffer.from(hasher.digest()).toString("base64");
  }

  test("validates correct Shopify signature", async () => {
    const body = '{"id":123,"topic":"orders/create"}';
    const signature = computeShopifyHmac(body, secret);

    const result = await verifier.verify(body, {
      "x-shopify-hmac-sha256": signature,
    }, { secret });

    expect(result.valid).toBe(true);
  });

  test("extracts topic from X-Shopify-Topic", async () => {
    const body = '{"id":123}';
    const signature = computeShopifyHmac(body, secret);

    const result = await verifier.verify(body, {
      "x-shopify-hmac-sha256": signature,
      "x-shopify-topic": "orders/create",
      "x-shopify-shop-domain": "my-shop.myshopify.com",
    }, { secret });

    expect(result.valid).toBe(true);
    expect(result.eventType).toBe("orders/create");
    expect(result.metadata?.shopifyTopic).toBe("orders/create");
    expect(result.metadata?.shopifyShopDomain).toBe("my-shop.myshopify.com");
  });

  test("rejects wrong secret", async () => {
    const body = '{"id":123}';
    const signature = computeShopifyHmac(body, secret);

    const result = await verifier.verify(body, {
      "x-shopify-hmac-sha256": signature,
    }, { secret: "wrong-secret" });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Signature mismatch");
  });

  test("rejects missing header", async () => {
    const result = await verifier.verify("body", {}, { secret });
    expect(result.valid).toBe(false);
  });

  test("rejects missing secret", async () => {
    const result = await verifier.verify("body", { "x-shopify-hmac-sha256": "sig" }, {});
    expect(result.valid).toBe(false);
  });
});
