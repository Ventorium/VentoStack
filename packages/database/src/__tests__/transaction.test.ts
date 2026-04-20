import { describe, test, expect } from "bun:test";
import { createTransactionManager } from "../transaction";

function mockExecutor(): { executor: (sql: string, params?: unknown[]) => Promise<unknown[]>; queries: string[] } {
  const queries: string[] = [];
  const executor = async (sql: string) => { queries.push(sql); return []; };
  return { executor, queries };
}

describe("createTransactionManager", () => {
  test("begin and commit", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    expect(tm.isActive()).toBe(true);
    expect(tm.depth()).toBe(1);
    await tm.commit();
    expect(tm.isActive()).toBe(false);
    expect(tm.depth()).toBe(0);
    expect(queries).toEqual(["BEGIN", "COMMIT"]);
  });

  test("begin and rollback", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.rollback();
    expect(tm.isActive()).toBe(false);
    expect(queries).toEqual(["BEGIN", "ROLLBACK"]);
  });

  test("begin with isolation level", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin({ isolation: "serializable" });
    await tm.commit();
    expect(queries[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
  });

  test("begin with readOnly", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin({ readOnly: true });
    await tm.commit();
    expect(queries[0]).toContain("READ ONLY");
  });

  test("nested transaction uses savepoint", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.begin(); // nested
    expect(tm.depth()).toBe(2);
    await tm.commit(); // release savepoint
    expect(tm.depth()).toBe(1);
    await tm.commit(); // commit
    expect(queries).toContain("SAVEPOINT sp_1");
    expect(queries).toContain("RELEASE SAVEPOINT sp_1");
  });

  test("nested rollback uses rollback to savepoint", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.begin();
    await tm.rollback();
    expect(queries).toContain("ROLLBACK TO SAVEPOINT sp_1");
    await tm.commit();
  });

  test("commit without transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.commit()).rejects.toThrow("No active transaction");
  });

  test("rollback without transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.rollback()).rejects.toThrow("No active transaction");
  });

  test("savepoint outside transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.savepoint("sp")).rejects.toThrow("No active transaction");
  });

  test("named savepoint and rollbackTo", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.savepoint("my_sp");
    await tm.rollbackTo("my_sp");
    await tm.releaseSavepoint("my_sp");
    await tm.commit();
    expect(queries).toContain("SAVEPOINT my_sp");
    expect(queries).toContain("ROLLBACK TO SAVEPOINT my_sp");
    expect(queries).toContain("RELEASE SAVEPOINT my_sp");
  });

  test("nested helper commits on success", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    const result = await tm.nested(async () => 42);
    expect(result).toBe(42);
    await tm.commit();
  });

  test("nested helper rollbacks on error", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await expect(tm.nested(async () => { throw new Error("fail"); })).rejects.toThrow("fail");
    await tm.commit();
  });
});
