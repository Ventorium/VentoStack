import { describe, test, expect } from "bun:test";
import { createAuditExporter } from "../audit-export";
import { createAuditLog } from "../audit";

describe("createAuditExporter", () => {
  const exporter = createAuditExporter();

  test("toCSV generates valid CSV", async () => {
    const store = createAuditLog();
    await store.append({ actor: "user1", action: "create", resource: "post", result: "success" });
    await store.append({ actor: "user2", action: "delete", resource: "post", resourceId: "123", result: "denied" });
    const entries = await store.query({});
    const csv = exporter.toCSV(entries);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,timestamp,actor,action,resource,resourceId,result,hash");
    expect(lines).toHaveLength(3); // header + 2 entries
    expect(lines[1]).toContain("user1");
    expect(lines[2]).toContain("user2");
  });

  test("toCSV escapes commas and quotes", () => {
    const entry = {
      id: "1",
      timestamp: Date.now(),
      actor: 'user "admin"',
      action: "create, update",
      resource: "post",
      result: "success" as const,
      hash: "abc",
    };
    const csv = exporter.toCSV([entry]);
    expect(csv).toContain('"user ""admin"""');
    expect(csv).toContain('"create, update"');
  });

  test("toJSONL generates valid JSONL", async () => {
    const store = createAuditLog();
    await store.append({ actor: "a", action: "x", resource: "r", result: "success" });
    await store.append({ actor: "b", action: "y", resource: "r", result: "failure" });
    const entries = await store.query({});
    const jsonl = exporter.toJSONL(entries);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).actor).toBe("a");
    expect(JSON.parse(lines[1]!).actor).toBe("b");
  });

  test("queryPaginated returns page 1", async () => {
    const store = createAuditLog();
    for (let i = 0; i < 10; i++) {
      await store.append({ actor: `user${i}`, action: "test", resource: "r", result: "success" });
    }
    const result = await exporter.queryPaginated(store, { pageSize: 3, page: 1 });
    expect(result.entries).toHaveLength(3);
    expect(result.total).toBe(10);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);
  });

  test("queryPaginated returns page 2", async () => {
    const store = createAuditLog();
    for (let i = 0; i < 10; i++) {
      await store.append({ actor: `user${i}`, action: "test", resource: "r", result: "success" });
    }
    const result = await exporter.queryPaginated(store, { pageSize: 3, page: 2 });
    expect(result.entries).toHaveLength(3);
    expect(result.page).toBe(2);
  });

  test("queryPaginated with filters", async () => {
    const store = createAuditLog();
    await store.append({ actor: "admin", action: "create", resource: "r", result: "success" });
    await store.append({ actor: "user", action: "read", resource: "r", result: "success" });
    const result = await exporter.queryPaginated(store, { actor: "admin" });
    expect(result.total).toBe(1);
    expect(result.entries[0]!.actor).toBe("admin");
  });

  test("queryPaginated defaults", async () => {
    const store = createAuditLog();
    await store.append({ actor: "a", action: "x", resource: "r", result: "success" });
    const result = await exporter.queryPaginated(store, {});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });
});
