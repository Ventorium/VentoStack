import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@ventostack/database";
import { createTestAuthService, createTestDatabase, createTestUserService } from "../setup";

describe("auth-service", () => {
  let db: Database;
  let userService: ReturnType<typeof createTestUserService>;
  let authService: ReturnType<typeof createTestAuthService>;
  const jwtSecret = "test-secret-key-at-least-32-bytes-long!!";

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    userService = createTestUserService(db);
    authService = createTestAuthService(userService, jwtSecret);
  });

  test("hashPassword returns a bcrypt hash", async () => {
    const hash = await authService.hashPassword("password123");
    expect(hash).toStartWith("$2");
    expect(hash.length).toBeGreaterThan(50);
  });

  test("verifyPassword validates correct password", async () => {
    const hash = await authService.hashPassword("password123");
    const valid = await authService.verifyPassword("password123", hash);
    expect(valid).toBe(true);
  });

  test("verifyPassword rejects incorrect password", async () => {
    const hash = await authService.hashPassword("password123");
    const valid = await authService.verifyPassword("wrongpassword", hash);
    expect(valid).toBe(false);
  });

  test("createToken returns a JWT string", async () => {
    const user = await userService.createUser({
      name: "Alice",
      email: "alice@example.com",
      password: "password123",
      role: "admin",
    });

    const token = await authService.createToken(user);
    expect(token).toBeString();
    expect(token.split(".").length).toBe(3);
  });

  test("verifyToken decodes a valid token", async () => {
    const user = await userService.createUser({
      name: "Bob",
      email: "bob@example.com",
      password: "password123",
      role: "editor",
    });

    const token = await authService.createToken(user);
    const payload = await authService.verifyToken(token);
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.role).toBe(user.role);
  });

  test("loginUser returns token for valid credentials", async () => {
    await userService.createUser({
      name: "Charlie",
      email: "charlie@example.com",
      password: "password123",
      role: "viewer",
    });

    const result = await authService.loginUser({
      email: "charlie@example.com",
      password: "password123",
    });

    expect(result.token).toBeString();
    expect(result.user.email).toBe("charlie@example.com");
  });

  test("loginUser throws for invalid email", async () => {
    expect(
      authService.loginUser({
        email: "nonexistent@example.com",
        password: "password123",
      }),
    ).rejects.toThrow("Invalid email or password");
  });

  test("loginUser throws for invalid password", async () => {
    await userService.createUser({
      name: "Dave",
      email: "dave@example.com",
      password: "password123",
    });

    expect(
      authService.loginUser({
        email: "dave@example.com",
        password: "wrongpassword",
      }),
    ).rejects.toThrow("Invalid email or password");
  });
});
