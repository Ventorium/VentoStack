import { describe, test, expect } from "bun:test";
import { createFeatureToggle } from "../feature-toggle";

describe("createFeatureToggle", () => {
  test("registers and checks feature", () => {
    const toggle = createFeatureToggle();
    toggle.register({ name: "dark-mode", enabled: true });
    expect(toggle.isEnabled("dark-mode")).toBe(true);
  });

  test("returns false for unregistered feature", () => {
    const toggle = createFeatureToggle();
    expect(toggle.isEnabled("unknown")).toBe(false);
  });

  test("returns false for disabled feature", () => {
    const toggle = createFeatureToggle();
    toggle.register({ name: "beta", enabled: false });
    expect(toggle.isEnabled("beta")).toBe(false);
  });

  test("enables and disables feature", () => {
    const toggle = createFeatureToggle();
    toggle.register({ name: "x", enabled: false });
    toggle.enable("x");
    expect(toggle.isEnabled("x")).toBe(true);
    toggle.disable("x");
    expect(toggle.isEnabled("x")).toBe(false);
  });

  test("toggles feature", () => {
    const toggle = createFeatureToggle();
    toggle.register({ name: "x", enabled: true });
    toggle.toggle("x");
    expect(toggle.isEnabled("x")).toBe(false);
    toggle.toggle("x");
    expect(toggle.isEnabled("x")).toBe(true);
  });

  test("lists features", () => {
    const toggle = createFeatureToggle([
      { name: "a", enabled: true },
      { name: "b", enabled: false },
    ]);
    expect(toggle.list()).toHaveLength(2);
  });

  test("initializes with features", () => {
    const toggle = createFeatureToggle([
      { name: "a", enabled: true },
    ]);
    expect(toggle.isEnabled("a")).toBe(true);
  });

  test("condition-based feature", () => {
    const toggle = createFeatureToggle();
    toggle.register({
      name: "premium",
      enabled: true,
      condition: (ctx) => (ctx as { role: string }).role === "premium",
    });
    expect(toggle.isEnabled("premium", { role: "premium" })).toBe(true);
    expect(toggle.isEnabled("premium", { role: "free" })).toBe(false);
  });

  test("condition not evaluated when disabled", () => {
    const toggle = createFeatureToggle();
    toggle.register({
      name: "x",
      enabled: false,
      condition: () => true,
    });
    expect(toggle.isEnabled("x", {})).toBe(false);
  });

  test("setAll updates multiple flags", () => {
    const toggle = createFeatureToggle([
      { name: "a", enabled: true },
      { name: "b", enabled: false },
    ]);
    toggle.setAll({ a: false, b: true, c: true });
    expect(toggle.isEnabled("a")).toBe(false);
    expect(toggle.isEnabled("b")).toBe(true);
    expect(toggle.isEnabled("c")).toBe(true);
  });
});
