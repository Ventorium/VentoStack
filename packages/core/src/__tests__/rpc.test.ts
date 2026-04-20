import { describe, test, expect } from "bun:test";
import { createRPCRouter } from "../rpc";

describe("createRPCRouter", () => {
  test("register and call", async () => {
    const router = createRPCRouter();
    router.register("add", async (req: { a: number; b: number }) => req.a + req.b);
    const result = await router.call<{ a: number; b: number }, number>("add", { a: 1, b: 2 });
    expect(result).toBe(3);
  });

  test("register duplicate throws", () => {
    const router = createRPCRouter();
    router.register("test", async () => {});
    expect(() => router.register("test", async () => {})).toThrow("already registered");
  });

  test("call unknown method throws", async () => {
    const router = createRPCRouter();
    await expect(router.call("unknown", {})).rejects.toThrow("not found");
  });

  test("methods returns registered names", () => {
    const router = createRPCRouter();
    router.register("a", async () => {});
    router.register("b", async () => {});
    expect(router.methods()).toEqual(["a", "b"]);
  });

  test("handler error propagates", async () => {
    const router = createRPCRouter();
    router.register("fail", async () => { throw new Error("boom"); });
    await expect(router.call("fail", {})).rejects.toThrow("boom");
  });
});
