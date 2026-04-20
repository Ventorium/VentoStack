// @aeron/observability - 审计日志测试

import { describe, expect, it } from "bun:test";
import { createAuditLog } from "../audit";

describe("createAuditLog", () => {
  it("should append an entry with generated id and timestamp", async () => {
    const log = createAuditLog();
    const entry = await log.append({
      actor: "user1",
      action: "create",
      resource: "post",
      result: "success",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.actor).toBe("user1");
    expect(entry.action).toBe("create");
    expect(entry.resource).toBe("post");
    expect(entry.result).toBe("success");
    expect(entry.hash).toBeTruthy();
    expect(entry.previousHash).toBeUndefined();
  });

  it("should generate hash chain across entries", async () => {
    const log = createAuditLog();
    const first = await log.append({
      actor: "user1",
      action: "create",
      resource: "post",
      result: "success",
    });
    const second = await log.append({
      actor: "user2",
      action: "update",
      resource: "post",
      result: "success",
    });

    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it("should store optional metadata and resourceId", async () => {
    const log = createAuditLog();
    const entry = await log.append({
      actor: "admin",
      action: "delete",
      resource: "user",
      resourceId: "u123",
      result: "success",
      metadata: { reason: "requested" },
    });
    expect(entry.resourceId).toBe("u123");
    expect(entry.metadata).toEqual({ reason: "requested" });
  });

  it("should query by actor", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "read", resource: "doc", result: "success" });
    await log.append({ actor: "bob", action: "read", resource: "doc", result: "success" });
    await log.append({ actor: "alice", action: "write", resource: "doc", result: "success" });

    const results = await log.query({ actor: "alice" });
    expect(results.length).toBe(2);
    expect(results.every((e) => e.actor === "alice")).toBe(true);
  });

  it("should query by action", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "read", resource: "doc", result: "success" });
    await log.append({ actor: "bob", action: "write", resource: "doc", result: "success" });

    const results = await log.query({ action: "write" });
    expect(results.length).toBe(1);
    expect(results[0]!.actor).toBe("bob");
  });

  it("should query by resource", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "read", resource: "doc", result: "success" });
    await log.append({ actor: "alice", action: "read", resource: "user", result: "success" });

    const results = await log.query({ resource: "user" });
    expect(results.length).toBe(1);
  });

  it("should query by time range", async () => {
    const log = createAuditLog();
    const before = Date.now();
    await log.append({ actor: "alice", action: "a1", resource: "r", result: "success" });
    await Bun.sleep(10);
    const mid = Date.now();
    await Bun.sleep(10);
    await log.append({ actor: "alice", action: "a2", resource: "r", result: "success" });
    const after = Date.now();

    const results = await log.query({ from: mid, to: after });
    expect(results.length).toBe(1);
    expect(results[0]!.action).toBe("a2");
  });

  it("should query with limit", async () => {
    const log = createAuditLog();
    for (let i = 0; i < 5; i++) {
      await log.append({ actor: "alice", action: `a${i}`, resource: "r", result: "success" });
    }

    const results = await log.query({ limit: 3 });
    expect(results.length).toBe(3);
  });

  it("should verify intact hash chain", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "create", resource: "doc", result: "success" });
    await log.append({ actor: "bob", action: "update", resource: "doc", result: "success" });
    await log.append({ actor: "alice", action: "delete", resource: "doc", result: "success" });

    const result = await log.verify();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it("should detect tampered entry in hash chain", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "create", resource: "doc", result: "success" });
    await log.append({ actor: "bob", action: "update", resource: "doc", result: "success" });
    await log.append({ actor: "alice", action: "delete", resource: "doc", result: "success" });

    // Tamper with the internal data by querying and mutating
    const entries = await log.query({});
    // Directly mutate the hash of the second entry
    (entries[1] as { hash: string }).hash = "tampered-hash";

    const result = await log.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1); // Mutated entry's hash doesn't match recomputed
  });

  it("should verify empty log as valid", async () => {
    const log = createAuditLog();
    const result = await log.verify();
    expect(result.valid).toBe(true);
  });

  it("should combine multiple query filters", async () => {
    const log = createAuditLog();
    await log.append({ actor: "alice", action: "read", resource: "doc", result: "success" });
    await log.append({ actor: "alice", action: "write", resource: "doc", result: "failure" });
    await log.append({ actor: "bob", action: "write", resource: "doc", result: "success" });

    const results = await log.query({ actor: "alice", action: "write" });
    expect(results.length).toBe(1);
    expect(results[0]!.result).toBe("failure");
  });
});
