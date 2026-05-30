import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "@ventostack/database";
import { createTestDatabase, createTestUserService } from "../setup";

describe("user-service", () => {
  let db: Database;
  let userService: ReturnType<typeof createTestUserService>;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    userService = createTestUserService(db);
  });

  test("createUser creates a user with hashed password", async () => {
    const user = await userService.createUser({
      name: "Alice",
      email: "alice@example.com",
      password: "password123",
    });

    expect(user.id).toBeString();
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("viewer");
    expect(user.password_hash).not.toBe("password123");
  });

  test("getUserById returns the user", async () => {
    const created = await userService.createUser({
      name: "Bob",
      email: "bob@example.com",
      password: "password123",
    });

    const found = await userService.getUserById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.name).toBe("Bob");
  });

  test("getUserByEmail returns the user", async () => {
    const created = await userService.createUser({
      name: "Carol",
      email: "carol@example.com",
      password: "password123",
    });

    const found = await userService.getUserByEmail(created.email);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
  });

  test("listUsers returns all users", async () => {
    await userService.createUser({
      name: "User 1",
      email: "user1@example.com",
      password: "password123",
    });
    await userService.createUser({
      name: "User 2",
      email: "user2@example.com",
      password: "password123",
    });

    const users = await userService.listUsers();
    expect(users.length).toBe(2);
  });

  test("updateUser updates fields", async () => {
    const created = await userService.createUser({
      name: "Dave",
      email: "dave@example.com",
      password: "password123",
    });

    const updated = await userService.updateUser(created.id, { name: "David" });
    expect(updated.name).toBe("David");
    expect(updated.email).toBe("dave@example.com");
  });

  test("deleteUser removes the user", async () => {
    const created = await userService.createUser({
      name: "Eve",
      email: "eve@example.com",
      password: "password123",
    });

    await userService.deleteUser(created.id);
    const found = await userService.getUserByEmail(created.email);
    expect(found).toBeUndefined();
  });
});
