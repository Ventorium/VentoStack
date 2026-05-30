import { describe, expect, test } from "bun:test";
import { createTransactionManager } from "../transaction";

function mockExecutor(): {
  executor: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  queries: string[];
} {
  const queries: string[] = [];
  const executor = async (sql: string) => {
    queries.push(sql);
    return [];
  };
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

  test("releaseSavepoint outside transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.releaseSavepoint("sp")).rejects.toThrow("No active transaction");
  });

  test("rollbackTo outside transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.rollbackTo("sp")).rejects.toThrow("No active transaction");
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

  test("savepoint increments depth", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    expect(tm.depth()).toBe(1);
    await tm.savepoint("sp1");
    expect(tm.depth()).toBe(2);
    await tm.savepoint("sp2");
    expect(tm.depth()).toBe(3);
    await tm.releaseSavepoint("sp2");
    expect(tm.depth()).toBe(2);
    await tm.releaseSavepoint("sp1");
    expect(tm.depth()).toBe(1);
    await tm.commit();
    expect(tm.depth()).toBe(0);
  });

  test("rollbackTo truncates savepoints and decrements depth", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.savepoint("sp1");
    await tm.savepoint("sp2");
    await tm.savepoint("sp3");
    expect(tm.depth()).toBe(4);
    await tm.rollbackTo("sp2");
    expect(tm.depth()).toBe(3);
    await tm.releaseSavepoint("sp2");
    expect(tm.depth()).toBe(2);
    await tm.releaseSavepoint("sp1");
    expect(tm.depth()).toBe(1);
    await tm.commit();
    expect(queries).toContain("ROLLBACK TO SAVEPOINT sp2");
  });

  test("rollbackTo followed by commit works", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.savepoint("sp1");
    await tm.savepoint("sp2");
    await tm.rollbackTo("sp1");
    await tm.releaseSavepoint("sp1");
    await tm.commit();
    expect(tm.depth()).toBe(0);
    expect(tm.isActive()).toBe(false);
  });

  test("duplicate savepoint name throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.savepoint("sp1");
    await expect(tm.savepoint("sp1")).rejects.toThrow("Savepoint sp1 already exists");
  });

  test("releaseSavepoint on non-most-recent savepoint throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.savepoint("sp1");
    await tm.savepoint("sp2");
    await expect(tm.releaseSavepoint("sp1")).rejects.toThrow(
      "Savepoint sp1 is not the most recent savepoint",
    );
  });

  test("deep nesting: begin > begin > begin > commit > commit > commit", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin();
    await tm.begin();
    await tm.begin();
    expect(tm.depth()).toBe(3);
    await tm.commit();
    expect(tm.depth()).toBe(2);
    await tm.commit();
    expect(tm.depth()).toBe(1);
    await tm.commit();
    expect(tm.depth()).toBe(0);
    expect(queries).toEqual([
      "BEGIN",
      "SAVEPOINT sp_1",
      "SAVEPOINT sp_2",
      "RELEASE SAVEPOINT sp_2",
      "RELEASE SAVEPOINT sp_1",
      "COMMIT",
    ]);
  });

  test("begin with isolation and readOnly produces correct SQL", async () => {
    const { executor, queries } = mockExecutor();
    const tm = createTransactionManager(executor);
    await tm.begin({ isolation: "serializable", readOnly: true });
    await tm.commit();
    expect(queries[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
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
    await expect(
      tm.nested(async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");
    await tm.commit();
  });

  test("nested helper outside transaction throws", async () => {
    const { executor } = mockExecutor();
    const tm = createTransactionManager(executor);
    await expect(tm.nested(async () => 42)).rejects.toThrow("No active transaction");
  });
});
