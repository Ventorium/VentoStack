import { describe, test, expect } from "bun:test";
import { createPoolManager } from "../pool-manager";

describe("createPoolManager", () => {
  test("register adds resource", () => {
    const pm = createPoolManager();
    pm.register({ name: "db", close: async () => {} });
    expect(pm.list()).toEqual(["db"]);
  });

  test("register multiple resources", () => {
    const pm = createPoolManager();
    pm.register({ name: "db", close: async () => {} });
    pm.register({ name: "redis", close: async () => {} });
    expect(pm.list()).toEqual(["db", "redis"]);
  });

  test("releaseAll closes in reverse order", async () => {
    const pm = createPoolManager();
    const order: string[] = [];
    pm.register({ name: "first", close: async () => { order.push("first"); } });
    pm.register({ name: "second", close: async () => { order.push("second"); } });
    await pm.releaseAll();
    expect(order).toEqual(["second", "first"]);
  });

  test("releaseAll clears list", async () => {
    const pm = createPoolManager();
    pm.register({ name: "db", close: async () => {} });
    await pm.releaseAll();
    expect(pm.list()).toEqual([]);
  });

  test("releaseAll reports errors without stopping", async () => {
    const pm = createPoolManager();
    pm.register({ name: "ok", close: async () => {} });
    pm.register({ name: "fail", close: async () => { throw new Error("close error"); } });
    const results = await pm.releaseAll();
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("fail");
    expect(results[0].error).toBe("close error");
    expect(results[1].name).toBe("ok");
    expect(results[1].error).toBeUndefined();
  });
});
