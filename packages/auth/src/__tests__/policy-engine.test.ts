import { describe, test, expect } from "bun:test";
import { createPolicyEngine } from "../policy-engine";

describe("createPolicyEngine", () => {
  test("default deny", () => {
    const engine = createPolicyEngine();
    const result = engine.evaluate({ subject: "user", resource: "doc", action: "read" });
    expect(result.allowed).toBe(false);
  });

  test("allow rule", () => {
    const engine = createPolicyEngine();
    engine.addRule({ effect: "allow", subjects: ["admin"], resources: ["*"], actions: ["*"] });
    const result = engine.evaluate({ subject: "admin", resource: "doc", action: "read" });
    expect(result.allowed).toBe(true);
  });

  test("deny overrides allow", () => {
    const engine = createPolicyEngine();
    engine.addRule({ effect: "allow", subjects: ["*"], resources: ["*"], actions: ["read"] });
    engine.addRule({ effect: "deny", subjects: ["blocked"], resources: ["*"], actions: ["*"] });
    const result = engine.evaluate({ subject: "blocked", resource: "doc", action: "read" });
    expect(result.allowed).toBe(false);
  });

  test("wildcard matching", () => {
    const engine = createPolicyEngine();
    engine.addRule({ effect: "allow", subjects: ["user:*"], resources: ["doc:*"], actions: ["read"] });
    expect(engine.evaluate({ subject: "user:123", resource: "doc:456", action: "read" }).allowed).toBe(true);
    expect(engine.evaluate({ subject: "admin:1", resource: "doc:456", action: "read" }).allowed).toBe(false);
  });

  test("condition eq", () => {
    const engine = createPolicyEngine();
    engine.addRule({
      effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"],
      conditions: [{ field: "role", operator: "eq", value: "admin" }],
    });
    expect(engine.evaluate({ subject: "u1", resource: "r", action: "a", attributes: { role: "admin" } }).allowed).toBe(true);
    expect(engine.evaluate({ subject: "u1", resource: "r", action: "a", attributes: { role: "user" } }).allowed).toBe(false);
  });

  test("condition in", () => {
    const engine = createPolicyEngine();
    engine.addRule({
      effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"],
      conditions: [{ field: "role", operator: "in", value: ["admin", "moderator"] }],
    });
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { role: "admin" } }).allowed).toBe(true);
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { role: "user" } }).allowed).toBe(false);
  });

  test("condition gt/lt/gte/lte", () => {
    const engine = createPolicyEngine();
    engine.addRule({
      effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"],
      conditions: [{ field: "age", operator: "gte", value: 18 }],
    });
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { age: 20 } }).allowed).toBe(true);
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { age: 15 } }).allowed).toBe(false);
  });

  test("condition matches regex", () => {
    const engine = createPolicyEngine();
    engine.addRule({
      effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"],
      conditions: [{ field: "email", operator: "matches", value: ".*@company\\.com$" }],
    });
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { email: "user@company.com" } }).allowed).toBe(true);
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a", attributes: { email: "user@other.com" } }).allowed).toBe(false);
  });

  test("conditions skipped when no attributes", () => {
    const engine = createPolicyEngine();
    engine.addRule({
      effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"],
      conditions: [{ field: "role", operator: "eq", value: "admin" }],
    });
    expect(engine.evaluate({ subject: "u", resource: "r", action: "a" }).allowed).toBe(false);
  });

  test("removeRule", () => {
    const engine = createPolicyEngine();
    engine.addRule({ effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"] });
    expect(engine.getRules()).toHaveLength(1);
    expect(engine.removeRule(0)).toBe(true);
    expect(engine.getRules()).toHaveLength(0);
  });

  test("removeRule invalid index", () => {
    const engine = createPolicyEngine();
    expect(engine.removeRule(0)).toBe(false);
    expect(engine.removeRule(-1)).toBe(false);
  });

  test("clear removes all rules", () => {
    const engine = createPolicyEngine();
    engine.addRule({ effect: "allow", subjects: ["*"], resources: ["*"], actions: ["*"] });
    engine.clear();
    expect(engine.getRules()).toHaveLength(0);
  });

  test("matchedRule is returned", () => {
    const engine = createPolicyEngine();
    const rule = { effect: "allow" as const, subjects: ["admin"], resources: ["*"], actions: ["*"] };
    engine.addRule(rule);
    const result = engine.evaluate({ subject: "admin", resource: "r", action: "a" });
    expect(result.matchedRule).toBeDefined();
    expect(result.matchedRule!.subjects).toEqual(["admin"]);
  });
});
