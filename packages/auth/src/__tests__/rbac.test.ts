import { describe, test, expect } from "bun:test";
import { createRBAC } from "../rbac";

describe("createRBAC", () => {
  function setup() {
    const rbac = createRBAC();
    rbac.addRole({
      name: "admin",
      permissions: [
        { resource: "users", action: "read" },
        { resource: "users", action: "write" },
        { resource: "users", action: "delete" },
        { resource: "posts", action: "read" },
        { resource: "posts", action: "write" },
      ],
    });
    rbac.addRole({
      name: "editor",
      permissions: [
        { resource: "posts", action: "read" },
        { resource: "posts", action: "write" },
      ],
    });
    rbac.addRole({
      name: "viewer",
      permissions: [
        { resource: "posts", action: "read" },
        { resource: "users", action: "read" },
      ],
    });
    return rbac;
  }

  describe("addRole / getRole", () => {
    test("adds and retrieves a role", () => {
      const rbac = createRBAC();
      rbac.addRole({
        name: "test",
        permissions: [{ resource: "a", action: "b" }],
      });
      const role = rbac.getRole("test");
      expect(role).toBeDefined();
      expect(role!.name).toBe("test");
      expect(role!.permissions).toEqual([{ resource: "a", action: "b" }]);
    });

    test("returns undefined for non-existent role", () => {
      const rbac = createRBAC();
      expect(rbac.getRole("none")).toBeUndefined();
    });

    test("overwrites existing role", () => {
      const rbac = createRBAC();
      rbac.addRole({
        name: "x",
        permissions: [{ resource: "a", action: "read" }],
      });
      rbac.addRole({
        name: "x",
        permissions: [{ resource: "b", action: "write" }],
      });
      const role = rbac.getRole("x");
      expect(role!.permissions).toEqual([{ resource: "b", action: "write" }]);
    });
  });

  describe("removeRole", () => {
    test("removes a role", () => {
      const rbac = setup();
      rbac.removeRole("editor");
      expect(rbac.getRole("editor")).toBeUndefined();
    });

    test("does nothing for non-existent role", () => {
      const rbac = createRBAC();
      // Should not throw
      rbac.removeRole("non-existent");
    });
  });

  describe("hasPermission", () => {
    test("returns true for granted permission", () => {
      const rbac = setup();
      expect(rbac.hasPermission("admin", "users", "read")).toBe(true);
      expect(rbac.hasPermission("admin", "users", "delete")).toBe(true);
    });

    test("returns false for non-granted permission", () => {
      const rbac = setup();
      expect(rbac.hasPermission("viewer", "users", "write")).toBe(false);
      expect(rbac.hasPermission("editor", "users", "delete")).toBe(false);
    });

    test("returns false for non-existent role", () => {
      const rbac = setup();
      expect(rbac.hasPermission("unknown", "users", "read")).toBe(false);
    });
  });

  describe("can (multi-role)", () => {
    test("returns true if any role has permission", () => {
      const rbac = setup();
      expect(rbac.can(["viewer", "editor"], "posts", "write")).toBe(true);
    });

    test("returns false if no role has permission", () => {
      const rbac = setup();
      expect(rbac.can(["viewer", "editor"], "users", "delete")).toBe(false);
    });

    test("returns false for empty roles array", () => {
      const rbac = setup();
      expect(rbac.can([], "users", "read")).toBe(false);
    });

    test("returns false for non-existent roles", () => {
      const rbac = setup();
      expect(rbac.can(["ghost"], "users", "read")).toBe(false);
    });

    test("default deny - unadded permission returns false", () => {
      const rbac = setup();
      expect(rbac.can(["admin"], "settings", "write")).toBe(false);
    });
  });

  describe("listRoles", () => {
    test("lists all roles", () => {
      const rbac = setup();
      const roles = rbac.listRoles();
      expect(roles.length).toBe(3);
      const names = roles.map((r) => r.name).sort();
      expect(names).toEqual(["admin", "editor", "viewer"]);
    });

    test("returns empty array when no roles", () => {
      const rbac = createRBAC();
      expect(rbac.listRoles()).toEqual([]);
    });

    test("returns defensive copies", () => {
      const rbac = createRBAC();
      rbac.addRole({
        name: "test",
        permissions: [{ resource: "a", action: "b" }],
      });
      const roles = rbac.listRoles();
      roles[0]!.permissions.push({ resource: "x", action: "y" });
      // Original should be unchanged
      const original = rbac.getRole("test");
      expect(original!.permissions.length).toBe(1);
    });
  });
});
