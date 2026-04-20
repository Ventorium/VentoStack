import { describe, test, expect } from "bun:test";
import { createABTestManager } from "../ab-testing";

const makeVariants = (names: string[], weight = 50) =>
  names.map((name) => ({ name, weight }));

describe("createABTestManager", () => {
  test("define a test", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "homepage", enabled: true, variants: makeVariants(["control", "variant-a"]) });
    const list = mgr.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("homepage");
    expect(list[0].enabled).toBe(true);
  });

  test("assign returns valid variant", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, variants: makeVariants(["a", "b"]) });
    const result = mgr.assign("test", "user-1");
    expect(result).not.toBeNull();
    expect(["a", "b"]).toContain(result!.variant);
  });

  test("assign without userId still works", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, variants: makeVariants(["a", "b"]) });
    const result = mgr.assign("test");
    expect(result).not.toBeNull();
    expect(["a", "b"]).toContain(result!.variant);
  });

  test("assign is sticky for same user", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, sticky: true, variants: makeVariants(["a", "b"]) });
    const v1 = mgr.assign("test", "user-42");
    const v2 = mgr.assign("test", "user-42");
    expect(v1!.variant).toBe(v2!.variant);
  });

  test("isInVariant checks correctly", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, sticky: true, variants: makeVariants(["a", "b"]) });
    const result = mgr.assign("test", "user-1");
    expect(result).not.toBeNull();
    expect(mgr.isInVariant("test", result!.variant, "user-1")).toBe(true);
  });

  test("disable and enable test", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, variants: makeVariants(["a", "b"]) });
    mgr.disable("test");
    expect(mgr.list()[0].enabled).toBe(false);
    mgr.enable("test");
    expect(mgr.list()[0].enabled).toBe(true);
  });

  test("assign on disabled test returns null", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, variants: makeVariants(["control", "variant"]) });
    mgr.disable("test");
    const v = mgr.assign("test", "user-1");
    expect(v).toBeNull();
  });

  test("define duplicate throws", () => {
    const mgr = createABTestManager();
    mgr.define({ name: "test", enabled: true, variants: makeVariants(["a", "b"]) });
    expect(() => mgr.define({ name: "test", enabled: true, variants: makeVariants(["a", "b"]) })).toThrow("already defined");
  });

  test("assign on undefined test throws", () => {
    const mgr = createABTestManager();
    expect(() => mgr.assign("nope", "user-1")).toThrow("not found");
  });
});
