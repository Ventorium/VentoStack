import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TestAppInstance, TestClient } from "@ventostack/testing";
import { setupIntegrationTest, teardownIntegrationTest } from "./setup";

describe("openapi endpoints", () => {
  let testApp: TestAppInstance;
  let client: TestClient;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    testApp = setup.testApp;
    client = setup.client;
  });

  afterAll(async () => {
    await teardownIntegrationTest(testApp);
  });

  test("GET /openapi.json returns OpenAPI spec", async () => {
    const res = await client.get("/openapi.json");
    expect(res.status).toBe(200);
    const body = res.json<{ openapi: string; info: { title: string } }>();
    expect(body.openapi).toBeString();
    expect(body.info.title).toBe("VentoStack Example API");
  });

  test("GET /docs returns Scalar UI HTML", async () => {
    const res = await client.get("/docs");
    expect(res.status).toBe(200);
    const text = res.text;
    expect(text).toContain("Scalar");
    expect(text).toContain("openapi.json");
  });
});
