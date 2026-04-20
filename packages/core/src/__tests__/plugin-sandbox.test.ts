import { describe, test, expect } from "bun:test";
import { createPluginSandbox } from "../plugin-sandbox";

describe("createPluginSandbox", () => {
  test("register adds plugin", () => {
    const sb = createPluginSandbox();
    sb.register({ name: "test-plugin" });
    expect(sb.list()).toHaveLength(1);
    expect(sb.list()[0].name).toBe("test-plugin");
    expect(sb.list()[0].status).toBe("registered");
  });

  test("register duplicate throws", () => {
    const sb = createPluginSandbox();
    sb.register({ name: "test" });
    expect(() => sb.register({ name: "test" })).toThrow("already registered");
  });

  test("initAll calls install on each plugin", async () => {
    const sb = createPluginSandbox();
    let installed = false;
    sb.register({ name: "p1", install: () => { installed = true; } });
    const results = await sb.initAll({});
    expect(installed).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].duration).toBeGreaterThanOrEqual(0);
    expect(sb.list()[0].status).toBe("initialized");
  });

  test("initAll isolates failures", async () => {
    const sb = createPluginSandbox();
    sb.register({ name: "good", install: () => {} });
    sb.register({ name: "bad", install: () => { throw new Error("plugin error"); } });
    const results = await sb.initAll({});
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe("plugin error");
    expect(sb.list()[1].status).toBe("failed");
  });

  test("destroyAll calls destroy on plugins", async () => {
    const sb = createPluginSandbox();
    let destroyed = false;
    sb.register({ name: "p1", destroy: () => { destroyed = true; } });
    await sb.destroyAll();
    expect(destroyed).toBe(true);
    expect(sb.list()[0].status).toBe("destroyed");
  });

  test("destroyAll handles destroy errors gracefully", async () => {
    const sb = createPluginSandbox();
    sb.register({ name: "p1", destroy: () => { throw new Error("destroy error"); } });
    await sb.destroyAll(); // should not throw
    expect(sb.list()[0].status).toBe("destroyed");
  });

  test("plugin without install/destroy works fine", async () => {
    const sb = createPluginSandbox();
    sb.register({ name: "minimal" });
    const results = await sb.initAll({});
    expect(results[0].success).toBe(true);
    await sb.destroyAll();
    expect(sb.list()[0].status).toBe("destroyed");
  });

  test("list returns copies", () => {
    const sb = createPluginSandbox();
    sb.register({ name: "p1", version: "1.0" });
    const list = sb.list();
    expect(list[0].version).toBe("1.0");
  });
});
