import { describe, test, expect } from "bun:test";
import { createDriverAdapter } from "../driver";

describe("createDriverAdapter", () => {
  describe("postgresql", () => {
    const pg = createDriverAdapter("postgresql");
    test("driver name", () => expect(pg.driver).toBe("postgresql"));
    test("placeholder", () => expect(pg.placeholder(1)).toBe("$1"));
    test("quote", () => expect(pg.quote("id")).toBe('"id"'));
    test("limitOffset", () => expect(pg.limitOffset(10, 20)).toBe("LIMIT 10 OFFSET 20"));
    test("returning", () => expect(pg.returning(["id", "name"])).toBe("RETURNING id, name"));
    test("now", () => expect(pg.now()).toBe("NOW()"));
    test("boolean true", () => expect(pg.boolean(true)).toBe("TRUE"));
    test("boolean false", () => expect(pg.boolean(false)).toBe("FALSE"));
    test("upsert", () => {
      const sql = pg.upsert("users", ["id", "name", "email"], ["id"]);
      expect(sql).toContain("ON CONFLICT");
      expect(sql).toContain("EXCLUDED");
    });
  });

  describe("mysql", () => {
    const my = createDriverAdapter("mysql");
    test("driver name", () => expect(my.driver).toBe("mysql"));
    test("placeholder", () => expect(my.placeholder(1)).toBe("?"));
    test("quote", () => expect(my.quote("id")).toBe("`id`"));
    test("returning is empty", () => expect(my.returning(["id"])).toBe(""));
    test("now", () => expect(my.now()).toBe("NOW()"));
    test("boolean", () => expect(my.boolean(true)).toBe("1"));
    test("upsert", () => {
      const sql = my.upsert("users", ["id", "name"], ["id"]);
      expect(sql).toContain("ON DUPLICATE KEY UPDATE");
    });
  });

  describe("sqlite", () => {
    const sq = createDriverAdapter("sqlite");
    test("driver name", () => expect(sq.driver).toBe("sqlite"));
    test("placeholder", () => expect(sq.placeholder(1)).toBe("?"));
    test("quote", () => expect(sq.quote("id")).toBe('"id"'));
    test("now", () => expect(sq.now()).toContain("datetime"));
    test("boolean", () => expect(sq.boolean(false)).toBe("0"));
    test("upsert", () => {
      const sql = sq.upsert("users", ["id", "name"], ["id"]);
      expect(sql).toContain("ON CONFLICT");
    });
  });

  describe("mssql", () => {
    const ms = createDriverAdapter("mssql");
    test("driver name", () => expect(ms.driver).toBe("mssql"));
    test("placeholder", () => expect(ms.placeholder(1)).toBe("@p1"));
    test("quote", () => expect(ms.quote("id")).toBe("[id]"));
    test("limitOffset", () => expect(ms.limitOffset(10, 20)).toContain("OFFSET 20 ROWS FETCH NEXT 10"));
    test("returning", () => expect(ms.returning(["id"])).toContain("OUTPUT"));
    test("now", () => expect(ms.now()).toBe("GETDATE()"));
    test("upsert", () => {
      const sql = ms.upsert("users", ["id", "name"], ["id"]);
      expect(sql).toContain("MERGE");
    });
  });

  test("unsupported driver throws", () => {
    expect(() => createDriverAdapter("oracle" as never)).toThrow("Unsupported");
  });
});
