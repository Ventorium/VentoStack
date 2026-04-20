import { describe, expect, test } from "bun:test";
import { createDBIsolation, withTransaction } from "../db-isolation";

describe("createDBIsolation", () => {
  test("begin executes BEGIN statement", async () => {
    const executed: string[] = [];
    const isolation = createDBIsolation({
      executor: async (sql) => {
        executed.push(sql);
      },
    });

    await isolation.begin();
    expect(executed).toEqual(["BEGIN"]);
  });

  test("rollback executes ROLLBACK statement", async () => {
    const executed: string[] = [];
    const isolation = createDBIsolation({
      executor: async (sql) => {
        executed.push(sql);
      },
    });

    await isolation.rollback();
    expect(executed).toEqual(["ROLLBACK"]);
  });

  test("savepoint creates named savepoint", async () => {
    const executed: string[] = [];
    const isolation = createDBIsolation({
      executor: async (sql) => {
        executed.push(sql);
      },
    });

    await isolation.savepoint("sp1");
    expect(executed).toEqual(["SAVEPOINT sp1"]);
  });

  test("rollbackTo rolls back to named savepoint", async () => {
    const executed: string[] = [];
    const isolation = createDBIsolation({
      executor: async (sql) => {
        executed.push(sql);
      },
    });

    await isolation.rollbackTo("sp1");
    expect(executed).toEqual(["ROLLBACK TO SAVEPOINT sp1"]);
  });

  test("savepoint rejects invalid names", async () => {
    const isolation = createDBIsolation({
      executor: async () => {},
    });

    expect(() => isolation.savepoint("'; DROP TABLE --")).toThrow(
      /Invalid savepoint name/,
    );
  });

  test("rollbackTo rejects invalid names", async () => {
    const isolation = createDBIsolation({
      executor: async () => {},
    });

    expect(() => isolation.rollbackTo("bad name")).toThrow(
      /Invalid savepoint name/,
    );
  });

  test("full transaction lifecycle", async () => {
    const executed: string[] = [];
    const isolation = createDBIsolation({
      executor: async (sql) => {
        executed.push(sql);
      },
    });

    await isolation.begin();
    await isolation.savepoint("step1");
    await isolation.rollbackTo("step1");
    await isolation.rollback();

    expect(executed).toEqual([
      "BEGIN",
      "SAVEPOINT step1",
      "ROLLBACK TO SAVEPOINT step1",
      "ROLLBACK",
    ]);
  });
});

describe("withTransaction", () => {
  test("beforeEach calls BEGIN", async () => {
    const executed: string[] = [];
    const hooks = withTransaction(async (sql) => {
      executed.push(sql);
    });

    await hooks.beforeEach();
    expect(executed).toEqual(["BEGIN"]);
  });

  test("afterEach calls ROLLBACK", async () => {
    const executed: string[] = [];
    const hooks = withTransaction(async (sql) => {
      executed.push(sql);
    });

    await hooks.afterEach();
    expect(executed).toEqual(["ROLLBACK"]);
  });

  test("beforeEach + afterEach wraps a transaction", async () => {
    const executed: string[] = [];
    const hooks = withTransaction(async (sql) => {
      executed.push(sql);
    });

    await hooks.beforeEach();
    await hooks.afterEach();
    expect(executed).toEqual(["BEGIN", "ROLLBACK"]);
  });
});
