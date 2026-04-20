import { describe, test, expect } from "bun:test";
import { createMultiDeviceManager } from "../multi-device";

describe("createMultiDeviceManager", () => {
  test("login adds session", async () => {
    const mgr = createMultiDeviceManager();
    const result = await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    expect(result.allowed).toBe(true);
    expect(mgr.getActiveDeviceCount("u1")).toBe(1);
    expect(mgr.getSessions("u1")).toHaveLength(1);
  });

  test("logout removes session", async () => {
    const mgr = createMultiDeviceManager();
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    mgr.logout("u1", "s1");
    expect(mgr.getActiveDeviceCount("u1")).toBe(0);
  });

  test("logoutAll removes all sessions", async () => {
    const mgr = createMultiDeviceManager();
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    await mgr.login("u1", { sessionId: "s2", userId: "u1", deviceType: "mobile" });
    mgr.logoutAll("u1");
    expect(mgr.getActiveDeviceCount("u1")).toBe(0);
  });

  test("isSessionValid checks correctly", async () => {
    const mgr = createMultiDeviceManager();
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    expect(mgr.isSessionValid("u1", "s1")).toBe(true);
    expect(mgr.isSessionValid("u1", "s2")).toBe(false);
    expect(mgr.isSessionValid("u2", "s1")).toBe(false);
  });

  test("touch updates lastActiveAt", async () => {
    const mgr = createMultiDeviceManager();
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    const before = mgr.getSessions("u1")[0].lastActiveAt;
    await Bun.sleep(10);
    mgr.touch("u1", "s1");
    const after = mgr.getSessions("u1")[0].lastActiveAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  test("kick-oldest on maxPerType", async () => {
    const mgr = createMultiDeviceManager({ maxPerType: 1 });
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    const result = await mgr.login("u1", { sessionId: "s2", userId: "u1", deviceType: "web" });
    expect(result.allowed).toBe(true);
    expect(result.kicked).toContain("s1");
    expect(mgr.getActiveDeviceCount("u1")).toBe(1);
    expect(mgr.isSessionValid("u1", "s2")).toBe(true);
  });

  test("reject on maxPerType overflow", async () => {
    const mgr = createMultiDeviceManager({ maxPerType: 1, overflowStrategy: "reject" });
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    const result = await mgr.login("u1", { sessionId: "s2", userId: "u1", deviceType: "web" });
    expect(result.allowed).toBe(false);
  });

  test("kick-oldest on maxDevices", async () => {
    const mgr = createMultiDeviceManager({ maxDevices: 2, maxPerType: 5 });
    await mgr.login("u1", { sessionId: "s1", userId: "u1", deviceType: "web" });
    await mgr.login("u1", { sessionId: "s2", userId: "u1", deviceType: "mobile" });
    const result = await mgr.login("u1", { sessionId: "s3", userId: "u1", deviceType: "tablet" });
    expect(result.allowed).toBe(true);
    expect(result.kicked).toBeDefined();
    expect(mgr.getActiveDeviceCount("u1")).toBe(2);
  });

  test("getSessions for unknown user returns empty", () => {
    const mgr = createMultiDeviceManager();
    expect(mgr.getSessions("unknown")).toEqual([]);
  });
});
