/**
 * @ventostack/system - UserService 测试
 */

import { describe, expect, test } from "bun:test";
import { createUserService } from "../services/user";
import { createMockExecutor, createMockDatabase, createTestCache, createMockPasswordHasher, createMockConfigService } from "./helpers";

function setup(configOverrides: Record<string, string> = {}) {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_user", "sys_user", true);
  registerModel("sys_user_role", "sys_user_role", false);
  registerModel("sys_role", "sys_role", true);
  const cache = createTestCache();
  const passwordHasher = createMockPasswordHasher();
  const configService = createMockConfigService(configOverrides);
  const userService = createUserService({ db, passwordHasher, cache, configService });
  return { userService, executor: mockExec.executor, calls, results: mockExec.results, passwordHasher, configService };
}

describe("UserService", () => {
  test("create user inserts with hashed password", async () => {
    const s = setup();
    s.results.set("INSERT", [{ id: "u-new" }]);
    const result = await s.userService.create({
      username: "alice", password: "pass123", nickname: "Alice",
    });
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe("string");
    expect(s.passwordHasher.hash).toHaveBeenCalledWith("pass123");
    expect(s.calls.length).toBeGreaterThan(0);
    expect(s.calls[0]!.text).toContain("INSERT");
  });

  test("create user uses default password from config when not provided", async () => {
    const s = setup();
    s.results.set("INSERT", [{ id: "u-new" }]);
    await s.userService.create({
      username: "alice", password: "",
    });
    // Should have used config default "123456"
    expect(s.passwordHasher.hash).toHaveBeenCalledWith("123456");
  });

  test("update user executes UPDATE", async () => {
    const s = setup();
    await s.userService.update("u1", { nickname: "Bob" });
    expect(s.calls.some(c => c.text.includes("UPDATE") || c.text.includes("update"))).toBe(true);
  });

  test("delete user performs soft delete", async () => {
    const s = setup();
    await s.userService.delete("u1");
    expect(s.calls.some(c => c.text.includes("UPDATE") || c.text.includes("DELETE"))).toBe(true);
  });

  test("getById returns user detail", async () => {
    const s = setup();
    s.results.set("SELECT", [{
      id: "u1", username: "admin", nickname: "Admin", status: 1, email: "a@b.com",
    }]);
    const user = await s.userService.getById("u1");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("admin");
  });

  test("getById returns null for non-existent user", async () => {
    const s = setup();
    const user = await s.userService.getById("nonexistent");
    expect(user).toBeNull();
  });

  test("list returns paginated results", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 5 }]);
    s.results.set("SELECT", [
      { id: "u1", username: "admin", status: 1 },
      { id: "u2", username: "user", status: 1 },
    ]);
    const result = await s.userService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(5);
  });

  test("resetPassword hashes new password", async () => {
    const s = setup();
    await s.userService.resetPassword("u1", "newpass");
    expect(s.passwordHasher.hash).toHaveBeenCalledWith("newpass");
  });

  test("resetPassword rejects weak password based on config", async () => {
    const s = setup({ sys_password_min_length: "8" });
    await expect(s.userService.resetPassword("u1", "short"))
      .rejects.toThrow();
  });

  test("updateStatus changes user status", async () => {
    const s = setup();
    await s.userService.updateStatus("u1", 0);
    expect(s.calls.some(c => c.text.includes("UPDATE") || c.text.includes("status"))).toBe(true);
  });
});
