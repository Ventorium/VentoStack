import { describe, test, expect } from "bun:test";
import { createABAC } from "../abac";

describe("createABAC", () => {
  test("default deny when no policies exist", () => {
    const abac = createABAC();
    const result = abac.evaluate({ role: "admin" }, { type: "document" });
    expect(result.allowed).toBe(false);
    expect(result.matchedPolicies).toEqual([]);
  });

  test("allows when an allow policy matches", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "admin-all",
      effect: "allow",
      condition: (subject) => subject.role === "admin",
    });
    const result = abac.evaluate({ role: "admin" }, { type: "document" });
    expect(result.allowed).toBe(true);
    expect(result.matchedPolicies).toEqual(["admin-all"]);
  });

  test("denies when no allow policy matches", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "admin-only",
      effect: "allow",
      condition: (subject) => subject.role === "admin",
    });
    const result = abac.evaluate({ role: "viewer" }, { type: "document" });
    expect(result.allowed).toBe(false);
    expect(result.matchedPolicies).toEqual([]);
  });

  test("deny policy overrides allow policy", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "allow-users",
      effect: "allow",
      condition: (subject) => subject.role === "user",
    });
    abac.addPolicy({
      name: "deny-sensitive",
      effect: "deny",
      condition: (_s, resource) => resource.classification === "secret",
    });
    const result = abac.evaluate(
      { role: "user" },
      { type: "doc", classification: "secret" },
    );
    expect(result.allowed).toBe(false);
    expect(result.matchedPolicies).toContain("allow-users");
    expect(result.matchedPolicies).toContain("deny-sensitive");
  });

  test("removePolicy works correctly", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "test-policy",
      effect: "allow",
      condition: () => true,
    });
    expect(abac.removePolicy("test-policy")).toBe(true);
    expect(abac.removePolicy("nonexistent")).toBe(false);
    const result = abac.evaluate({}, {});
    expect(result.allowed).toBe(false);
  });

  test("multiple policies can match", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "policy-a",
      effect: "allow",
      condition: () => true,
    });
    abac.addPolicy({
      name: "policy-b",
      effect: "allow",
      condition: () => true,
    });
    const result = abac.evaluate({}, {});
    expect(result.allowed).toBe(true);
    expect(result.matchedPolicies).toEqual(["policy-a", "policy-b"]);
  });

  test("listPolicies returns defensive copy", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "test",
      effect: "allow",
      condition: () => true,
    });
    const list1 = abac.listPolicies();
    const list2 = abac.listPolicies();
    expect(list1).toEqual(list2);
    expect(list1).not.toBe(list2);
    expect(list1[0]).not.toBe(list2[0]);
  });

  test("context parameter is passed to condition", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "time-based",
      effect: "allow",
      condition: (_s, _r, ctx) => ctx?.hour === 10,
    });
    const allowed = abac.evaluate({}, {}, { hour: 10 });
    expect(allowed.allowed).toBe(true);
    const denied = abac.evaluate({}, {}, { hour: 22 });
    expect(denied.allowed).toBe(false);
  });

  test("addPolicy overwrites existing policy with same name", () => {
    const abac = createABAC();
    abac.addPolicy({
      name: "rule",
      effect: "allow",
      condition: () => false,
    });
    abac.addPolicy({
      name: "rule",
      effect: "allow",
      condition: () => true,
    });
    const result = abac.evaluate({}, {});
    expect(result.allowed).toBe(true);
    expect(abac.listPolicies().length).toBe(1);
  });
});
