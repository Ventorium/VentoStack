import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TestAppInstance, TestClient } from "@ventostack/testing";
import { setupIntegrationTest, teardownIntegrationTest } from "./setup";

describe("users endpoints", () => {
  let testApp: TestAppInstance;
  let client: TestClient;
  let adminToken: string;
  let editorToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    testApp = setup.testApp;
    client = setup.client;

    const admin = await setup.userService.createUser({
      name: "Admin",
      email: "admin@example.com",
      password: "password123",
      role: "admin",
    });
    const editor = await setup.userService.createUser({
      name: "Editor",
      email: "editor@example.com",
      password: "password123",
      role: "editor",
    });
    const viewer = await setup.userService.createUser({
      name: "Viewer",
      email: "viewer@example.com",
      password: "password123",
      role: "viewer",
    });

    adminToken = await setup.authService.createToken(admin);
    editorToken = await setup.authService.createToken(editor);
    viewerToken = await setup.authService.createToken(viewer);
  });

  afterAll(async () => {
    await teardownIntegrationTest(testApp);
  });

  test("GET /api/users requires auth", async () => {
    const res = await client.get("/api/users");
    expect(res.status).toBe(401);
  });

  test("GET /api/users returns users for admin", async () => {
    const res = await client.get("/api/users", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = res.json<{ data: Array<{ email: string }> }>();
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  test("GET /api/users returns users for editor", async () => {
    const res = await client.get("/api/users", {
      headers: { Authorization: `Bearer ${editorToken}` },
    });
    expect(res.status).toBe(200);
  });

  test("GET /api/users rejects viewer (RBAC)", async () => {
    const res = await client.get("/api/users", {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    expect(res.status).toBe(403);
  });

  test("POST /api/users creates user (admin only)", async () => {
    const res = await client.post(
      "/api/users",
      {
        name: "New User",
        email: "newuser@example.com",
        password: "password123",
        role: "viewer",
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(201);
    const body = res.json<{ email: string; role: string }>();
    expect(body.email).toBe("newuser@example.com");
  });

  test("POST /api/users rejects editor", async () => {
    const res = await client.post(
      "/api/users",
      {
        name: "Another User",
        email: "another@example.com",
        password: "password123",
      },
      { headers: { Authorization: `Bearer ${editorToken}` } },
    );
    expect(res.status).toBe(403);
  });

  test("GET /api/users/:id returns a user", async () => {
    const listRes = await client.get("/api/users", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listBody = listRes.json<{ data: Array<{ id: string }> }>();
    const id = listBody.data[0]!.id;

    const res = await client.get(`/api/users/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = res.json<{ id: string }>();
    expect(body.id).toBe(id);
  });

  test("PATCH /api/users/:id updates user", async () => {
    const listRes = await client.get("/api/users", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listBody = listRes.json<{ data: Array<{ id: string }> }>();
    const id = listBody.data[0]!.id;

    const res = await client.patch(
      `/api/users/${id}`,
      { name: "Updated Name" },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.status).toBe(200);
    const body = res.json<{ name: string }>();
    expect(body.name).toBe("Updated Name");
  });

  test("DELETE /api/users/:id removes user", async () => {
    const created = await client.post(
      "/api/users",
      {
        name: "To Delete",
        email: "delete@example.com",
        password: "password123",
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const id = created.json<{ id: string }>().id;

    const res = await client.delete(`/api/users/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(204);
  });
});
