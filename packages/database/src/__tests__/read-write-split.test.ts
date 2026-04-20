import { describe, test, expect } from "bun:test";
import { createReadWriteSplit, createMultiDataSource } from "../read-write-split";

function mockSql(label: string): { executor: (sql: string) => Promise<unknown[]>; calls: string[] } {
  const calls: string[] = [];
  return { executor: async (sql: string) => { calls.push(`${label}:${sql}`); return []; }, calls };
}

describe("createReadWriteSplit", () => {
  test("read routes to reader", async () => {
    const w = mockSql("w");
    const r1 = mockSql("r1");
    const rw = createReadWriteSplit({ writer: w.executor, readers: [r1.executor] });
    await rw.read("SELECT 1");
    expect(r1.calls).toHaveLength(1);
    expect(w.calls).toHaveLength(0);
  });

  test("write routes to writer", async () => {
    const w = mockSql("w");
    const r1 = mockSql("r1");
    const rw = createReadWriteSplit({ writer: w.executor, readers: [r1.executor] });
    await rw.write("INSERT INTO t VALUES(1)");
    expect(w.calls).toHaveLength(1);
    expect(r1.calls).toHaveLength(0);
  });

  test("execute auto-detects write queries", async () => {
    const w = mockSql("w");
    const r1 = mockSql("r1");
    const rw = createReadWriteSplit({ writer: w.executor, readers: [r1.executor] });
    await rw.execute("UPDATE t SET x = 1");
    expect(w.calls).toHaveLength(1);
    await rw.execute("DELETE FROM t");
    expect(w.calls).toHaveLength(2);
  });

  test("execute auto-detects read queries", async () => {
    const w = mockSql("w");
    const r1 = mockSql("r1");
    const rw = createReadWriteSplit({ writer: w.executor, readers: [r1.executor] });
    await rw.execute("SELECT * FROM t");
    expect(r1.calls).toHaveLength(1);
  });

  test("round-robin across multiple readers", async () => {
    const w = mockSql("w");
    const r1 = mockSql("r1");
    const r2 = mockSql("r2");
    const rw = createReadWriteSplit({ writer: w.executor, readers: [r1.executor, r2.executor] });
    await rw.read("SELECT 1");
    await rw.read("SELECT 2");
    await rw.read("SELECT 3");
    expect(r1.calls).toHaveLength(2);
    expect(r2.calls).toHaveLength(1);
  });

  test("no readers throws", () => {
    const w = mockSql("w");
    expect(() => createReadWriteSplit({ writer: w.executor, readers: [] })).toThrow("At least one reader");
  });
});

describe("createMultiDataSource", () => {
  test("get returns named source", () => {
    const a = mockSql("a");
    const b = mockSql("b");
    const ds = createMultiDataSource({ sources: { a: a.executor, b: b.executor } });
    expect(ds.get("a")).toBe(a.executor);
    expect(ds.get("b")).toBe(b.executor);
  });

  test("getDefault returns first source", () => {
    const a = mockSql("a");
    const ds = createMultiDataSource({ sources: { a: a.executor } });
    expect(ds.getDefault()).toBe(a.executor);
  });

  test("getDefault with explicit default", () => {
    const a = mockSql("a");
    const b = mockSql("b");
    const ds = createMultiDataSource({ sources: { a: a.executor, b: b.executor }, defaultSource: "b" });
    expect(ds.getDefault()).toBe(b.executor);
  });

  test("get unknown throws", () => {
    const a = mockSql("a");
    const ds = createMultiDataSource({ sources: { a: a.executor } });
    expect(() => ds.get("nope")).toThrow("not found");
  });

  test("list returns source names", () => {
    const a = mockSql("a");
    const b = mockSql("b");
    const ds = createMultiDataSource({ sources: { a: a.executor, b: b.executor } });
    expect(ds.list()).toEqual(["a", "b"]);
  });

  test("has checks existence", () => {
    const a = mockSql("a");
    const ds = createMultiDataSource({ sources: { a: a.executor } });
    expect(ds.has("a")).toBe(true);
    expect(ds.has("b")).toBe(false);
  });

  test("empty sources throws", () => {
    expect(() => createMultiDataSource({ sources: {} })).toThrow("At least one data source");
  });
});
