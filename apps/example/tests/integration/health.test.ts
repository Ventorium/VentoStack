import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TestAppInstance, TestClient } from "@ventostack/testing";
import { setupIntegrationTest, teardownIntegrationTest } from "./setup";

describe("health endpoints", () => {
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

  test("GET / returns app info", async () => {
    const res = await client.get("/");
    expect(res.status).toBe(200);
    const body = res.json<{ name: string; version: string; env: string }>();
    expect(body.name).toBe("VentoStack Example");
    expect(body.version).toBe("1.0.0");
  });

  test("GET /health/live returns 200", async () => {
    const res = await client.get("/health/live");
    expect(res.status).toBe(200);
  });

  test("GET /health/ready returns 200 when database is healthy", async () => {
    const res = await client.get("/health/ready");
    expect(res.status).toBe(200);
  });

  test("GET /metrics returns Prometheus text", async () => {
    const res = await client.get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
