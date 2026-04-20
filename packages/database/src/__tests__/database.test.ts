import { describe, expect, mock, test } from "bun:test";
import { column, defineModel } from "../model";
import { createDatabase } from "../database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 100 }),
  email: column.varchar({ length: 255 }),
});

const PostModel = defineModel(
  "posts",
  {
    id: column.bigint({ primary: true }),
    title: column.varchar({ length: 200 }),
    userId: column.bigint(),
  },
  { softDelete: true },
);

function createMockExecutor() {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  const executor = mock(async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });
    return [];
  });
  return { executor, calls };
}

describe("createDatabase", () => {
  test("creates database with mock executor", () => {
    const { executor } = createMockExecutor();
    const db = createDatabase({ executor });
    expect(db).toBeDefined();
    expect(db.query).toBeFunction();
    expect(db.raw).toBeFunction();
    expect(db.transaction).toBeFunction();
    expect(db.close).toBeFunction();
  });

  test("throws without executor", () => {
    const db = createDatabase({});
    expect(() => db.raw("SELECT 1")).toThrow("No SQL executor configured");
  });
});

describe("Database.raw", () => {
  test("executes raw SQL", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ count: 42 }]);

    const db = createDatabase({ executor });
    const result = await db.raw("SELECT COUNT(*) FROM users");
    expect(result).toEqual([{ count: 42 }]);
    expect(executor).toHaveBeenCalledWith("SELECT COUNT(*) FROM users", undefined);
  });

  test("executes raw SQL with params", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "John" }]);

    const db = createDatabase({ executor });
    const result = await db.raw("SELECT * FROM users WHERE id = $1", [1]);
    expect(result).toEqual([{ id: 1, name: "John" }]);
    expect(executor).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [1]);
  });

  test("throws after close", async () => {
    const { executor } = createMockExecutor();
    const db = createDatabase({ executor });
    await db.close();
    expect(() => db.raw("SELECT 1")).toThrow("Database connection is closed");
  });
});

describe("Database.query - list", () => {
  test("list returns all rows", async () => {
    const { executor } = createMockExecutor();
    const mockUsers = [
      { id: 1, name: "Alice", email: "alice@test.com" },
      { id: 2, name: "Bob", email: "bob@test.com" },
    ];
    executor.mockResolvedValueOnce(mockUsers);

    const db = createDatabase({ executor });
    const users = await db.query(UserModel).list();

    expect(users).toEqual(mockUsers);
    expect(executor).toHaveBeenCalledWith("SELECT * FROM users", []);
  });

  test("list with where", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "Alice", email: "alice@test.com" }]);

    const db = createDatabase({ executor });
    const users = await db.query(UserModel).where("name", "=", "Alice").list();

    expect(users).toHaveLength(1);
    expect(executor).toHaveBeenCalledWith("SELECT * FROM users WHERE name = $1", ["Alice"]);
  });

  test("list with chained conditions", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db
      .query(UserModel)
      .where("name", "LIKE", "%a%")
      .orderBy("id", "desc")
      .limit(5)
      .list();

    expect(executor).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE name LIKE $1 ORDER BY id DESC LIMIT $2",
      ["%a%", 5],
    );
  });
});

describe("Database.query - get", () => {
  test("get returns first row", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "Alice", email: "alice@test.com" }]);

    const db = createDatabase({ executor });
    const user = await db.query(UserModel).where("id", "=", 1).get();

    expect(user).toEqual({ id: 1, name: "Alice", email: "alice@test.com" });
    expect(executor).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE id = $1 LIMIT $2",
      [1, 1],
    );
  });

  test("get returns undefined when no rows", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    const user = await db.query(UserModel).where("id", "=", 999).get();

    expect(user).toBeUndefined();
  });
});

describe("Database.query - count", () => {
  test("count returns number", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ count: 42 }]);

    const db = createDatabase({ executor });
    const total = await db.query(UserModel).count();

    expect(total).toBe(42);
    expect(executor).toHaveBeenCalledWith(
      "SELECT COUNT(*) as count FROM users",
      [],
    );
  });

  test("count returns 0 when no rows", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    const total = await db.query(UserModel).count();

    expect(total).toBe(0);
  });
});

describe("Database.query - insert", () => {
  test("insert without returning", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).insert({ name: "John", email: "john@test.com" });

    expect(result).toBeUndefined();
    expect(executor).toHaveBeenCalledWith(
      "INSERT INTO users (name, email) VALUES ($1, $2)",
      ["John", "john@test.com"],
    );
  });

  test("insert with returning", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "John", email: "john@test.com" }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).insert(
      { name: "John", email: "john@test.com" },
      { returning: true },
    );

    expect(result).toEqual({ id: 1, name: "John", email: "john@test.com" });
    expect(executor).toHaveBeenCalledWith(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
      ["John", "john@test.com"],
    );
  });
});

describe("Database.query - update", () => {
  test("update without returning", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(UserModel).where("id", "=", 1).update({ name: "Jane" });

    expect(executor).toHaveBeenCalledWith(
      "UPDATE users SET name = $1 WHERE id = $2",
      ["Jane", 1],
    );
  });

  test("update with returning", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "Jane", email: "jane@test.com" }]);

    const db = createDatabase({ executor });
    const result = await db
      .query(UserModel)
      .where("id", "=", 1)
      .update({ name: "Jane" }, { returning: true });

    expect(result).toEqual({ id: 1, name: "Jane", email: "jane@test.com" });
  });
});

describe("Database.query - delete", () => {
  test("hard delete on non-softDelete model", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(UserModel).where("id", "=", 1).delete();

    expect(executor).toHaveBeenCalledWith(
      "DELETE FROM users WHERE id = $1",
      [1],
    );
  });

  test("soft delete on softDelete model", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).delete();

    expect(executor).toHaveBeenCalledWith(
      "UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
      [1],
    );
  });

  test("force delete on softDelete model", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).delete({ force: true });

    expect(executor).toHaveBeenCalledWith(
      "DELETE FROM posts WHERE id = $1",
      [1],
    );
  });
});

describe("Database.query - select fields", () => {
  test("select specific fields", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([{ id: 1, name: "Alice" }]);

    const db = createDatabase({ executor });
    await db.query(UserModel).select("id", "name").list();

    expect(executor).toHaveBeenCalledWith(
      "SELECT id, name FROM users",
      [],
    );
  });
});

describe("Database.transaction", () => {
  test("commits on success", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    await db.transaction(async (tx) => {
      await tx.raw("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
    });

    expect(executor).toHaveBeenCalledWith("BEGIN");
    expect(executor).toHaveBeenCalledWith("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
    expect(executor).toHaveBeenCalledWith("COMMIT");
  });

  test("rolls back on error", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });

    await expect(
      db.transaction(async () => {
        throw new Error("Transaction failed");
      }),
    ).rejects.toThrow("Transaction failed");

    expect(executor).toHaveBeenCalledWith("BEGIN");
    expect(executor).toHaveBeenCalledWith("ROLLBACK");
  });

  test("returns transaction result", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    const result = await db.transaction(async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  test("transaction database can query models", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    await db.transaction(async (tx) => {
      await tx.query(UserModel).where("id", "=", 1).list();
    });

    // Should have BEGIN, the SELECT, and COMMIT
    expect(executor).toHaveBeenCalledTimes(3);
  });

  test("throws after close", async () => {
    const { executor } = createMockExecutor();
    const db = createDatabase({ executor });
    await db.close();
    expect(() => db.transaction(async () => {})).toThrow("Database connection is closed");
  });
});

describe("Database.close", () => {
  test("close prevents further queries", async () => {
    const { executor } = createMockExecutor();
    const db = createDatabase({ executor });
    await db.close();

    expect(() => db.query(UserModel)).toThrow("Database connection is closed");
  });
});

describe("Database.query - softDelete model select", () => {
  test("auto-injects deleted_at IS NULL", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(PostModel).list();

    expect(executor).toHaveBeenCalledWith(
      "SELECT * FROM posts WHERE deleted_at IS NULL",
      [],
    );
  });
});

describe("Database.query - offset", () => {
  test("offset on query executor", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValueOnce([]);

    const db = createDatabase({ executor });
    await db.query(UserModel).limit(10).offset(20).list();

    expect(executor).toHaveBeenCalledWith(
      "SELECT * FROM users LIMIT $1 OFFSET $2",
      [10, 20],
    );
  });
});

describe("Database.transaction - nested", () => {
  test("nested transaction uses SAVEPOINT", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    await db.transaction(async (tx) => {
      await tx.transaction(async (innerTx) => {
        await innerTx.raw("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
      });
    });

    // Should have BEGIN, SAVEPOINT, INSERT, RELEASE SAVEPOINT, COMMIT
    const calls = executor.mock.calls;
    expect(calls[0]![0]).toBe("BEGIN");
    expect(calls[1]![0]).toMatch(/^SAVEPOINT sp_/);
    expect(calls[2]![0]).toBe("INSERT INTO users (name) VALUES ($1)");
    expect(calls[3]![0]).toMatch(/^RELEASE SAVEPOINT sp_/);
    expect(calls[4]![0]).toBe("COMMIT");
  });

  test("nested transaction rolls back to SAVEPOINT on error", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    await db.transaction(async (tx) => {
      try {
        await tx.transaction(async () => {
          throw new Error("inner fail");
        });
      } catch {
        // swallow inner error
      }
    });

    const calls = executor.mock.calls;
    expect(calls[0]![0]).toBe("BEGIN");
    expect(calls[1]![0]).toMatch(/^SAVEPOINT sp_/);
    expect(calls[2]![0]).toMatch(/^ROLLBACK TO SAVEPOINT sp_/);
    expect(calls[3]![0]).toBe("COMMIT");
  });

  test("nested transaction close is no-op", async () => {
    const { executor } = createMockExecutor();
    executor.mockResolvedValue([]);

    const db = createDatabase({ executor });
    await db.transaction(async (tx) => {
      await tx.close(); // Should not throw or close real connection
      await tx.raw("SELECT 1");
    });
  });
});
