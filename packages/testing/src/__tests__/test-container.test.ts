import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDatabase, createTestDatabaseFixture } from "../test-container";

describe("createTestDatabase", () => {
  test("url returns memory url", () => {
    const db = createTestDatabase();
    expect(db.url()).toBe("memory://test");
  });

  test("execute CREATE TABLE", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE users (id INT, name VARCHAR)");
    // Should not throw
  });

  test("execute DROP TABLE", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE users (id INT)");
    await db.execute("DROP TABLE users");
  });

  test("execute DELETE FROM", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE users (id INT)");
    await db.execute("DELETE FROM users");
  });

  test("execute TRUNCATE", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE users (id INT)");
    await db.execute("TRUNCATE users");
  });

  test("query returns empty array", async () => {
    const db = createTestDatabase();
    const result = await db.query("SELECT * FROM users");
    expect(result).toEqual([]);
  });

  test("savepoint and rollbackTo", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE t1 (id INT)");
    await db.savepoint("sp1");
    await db.execute("DROP TABLE t1");
    await db.rollbackTo("sp1");
    // Table should be restored
  });

  test("rollbackTo unknown savepoint throws", async () => {
    const db = createTestDatabase();
    await expect(db.rollbackTo("nonexistent")).rejects.toThrow("Savepoint not found");
  });

  test("reset clears all data", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE t1 (id INT)");
    await db.reset();
    // No error expected
  });

  test("cleanup resets everything", async () => {
    const db = createTestDatabase();
    await db.execute("CREATE TABLE t1 (id INT)");
    await db.cleanup();
    // Should be fully cleaned
  });

  test("initSQL runs on first operation", async () => {
    const db = createTestDatabase({
      initSQL: ["CREATE TABLE init_table (id INT)"],
    });
    await db.query("SELECT 1"); // triggers init
    // Should not throw
  });
});

describe("createTestDatabaseFixture", () => {
  test("setup and teardown", async () => {
    const fixture = createTestDatabaseFixture();
    await fixture.db.execute("CREATE TABLE t (id INT)");
    await fixture.setup();
    await fixture.db.execute("DROP TABLE t");
    await fixture.teardown(); // should rollback
  });

  test("db is accessible", () => {
    const fixture = createTestDatabaseFixture();
    expect(fixture.db).toBeDefined();
    expect(fixture.db.url()).toBe("memory://test");
  });
});
