import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TestAppInstance, TestClient } from "@ventostack/testing";
import { setupIntegrationTest, teardownIntegrationTest } from "./setup";

describe("auth endpoints", () => {
  let testApp: TestAppInstance;
  let client: TestClient;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    testApp = setup.testApp;
    client = setup.client;
    await setup.userService.createUser({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
      role: "admin",
    });
  });

  afterAll(async () => {
    await teardownIntegrationTest(testApp);
  });

  test("POST /api/auth/login returns token for valid credentials", async () => {
    const res = await client.post("/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    const body = res.json<{ token: string; user: { email: string } }>();
    expect(body.token).toBeString();
    expect(body.user.email).toBe("test@example.com");
  });

  test("POST /api/auth/login rejects invalid password", async () => {
    const res = await client.post("/api/auth/login", {
      email: "test@example.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/login rejects nonexistent user", async () => {
    const res = await client.post("/api/auth/login", {
      email: "nobody@example.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/login rejects invalid body", async () => {
    const res = await client.post("/api/auth/login", { email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  test("GET /api/auth/me returns user with valid token", async () => {
    const loginRes = await client.post("/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    const { token } = loginRes.json<{ token: string }>();

    const meRes = await client.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    const body = meRes.json<{ user: { email: string } }>();
    expect(body.user.email).toBe("test@example.com");
  });

  test("GET /api/auth/me rejects missing token", async () => {
    const res = await client.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("GET /api/auth/me rejects invalid token", async () => {
    const res = await client.get("/api/auth/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });
});
