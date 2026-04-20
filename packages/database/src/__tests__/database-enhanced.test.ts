import { describe, expect, test } from "bun:test";
import { column, defineModel } from "../model";
import { createDatabase } from "../database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 100 }),
  email: column.varchar({ length: 255 }),
  age: column.int({ nullable: true }),
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

function createMockExecutor(defaultReturn: unknown[] = []) {
  const calls: Array<{ text: string; params?: unknown[] }> = [];
  let nextReturn: unknown[] | undefined;
  const executor = async (text: string, params?: unknown[]): Promise<unknown[]> => {
    calls.push({ text, params });
    if (nextReturn !== undefined) {
      const ret = nextReturn;
      nextReturn = undefined;
      return ret;
    }
    return defaultReturn;
  };
  const mockReturn = (value: unknown[]) => {
    nextReturn = value;
  };
  return { executor, calls, mockReturn };
}

describe("QueryExecutor.sum", () => {
  test("executes SUM query", async () => {
    const { executor, calls, mockReturn } = createMockExecutor();
    mockReturn([{ result: 150 }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).sum("age");
    expect(result).toBe(150);
    expect(calls[0]!.text).toBe("SELECT SUM(age) as result FROM users");
  });

  test("returns 0 when no rows", async () => {
    const { executor, mockReturn } = createMockExecutor();
    mockReturn([{ result: null }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).sum("age");
    expect(result).toBe(0);
  });

  test("sum with where clause", async () => {
    const { executor, calls, mockReturn } = createMockExecutor();
    mockReturn([{ result: 80 }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).where("age", ">=", 18).sum("age");
    expect(result).toBe(80);
    expect(calls[0]!.text).toBe("SELECT SUM(age) as result FROM users WHERE age >= $1");
    expect(calls[0]!.params).toEqual([18]);
  });
});

describe("QueryExecutor.avg", () => {
  test("executes AVG query", async () => {
    const { executor, calls, mockReturn } = createMockExecutor();
    mockReturn([{ result: 25.5 }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).avg("age");
    expect(result).toBe(25.5);
    expect(calls[0]!.text).toBe("SELECT AVG(age) as result FROM users");
  });

  test("returns 0 when no rows", async () => {
    const { executor, mockReturn } = createMockExecutor();
    mockReturn([{ result: null }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).avg("age");
    expect(result).toBe(0);
  });
});

describe("QueryExecutor.min", () => {
  test("executes MIN query", async () => {
    const { executor, calls, mockReturn } = createMockExecutor();
    mockReturn([{ result: 18 }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).min("age");
    expect(result).toBe(18);
    expect(calls[0]!.text).toBe("SELECT MIN(age) as result FROM users");
  });

  test("returns 0 when no rows", async () => {
    const { executor, mockReturn } = createMockExecutor();
    mockReturn([{ result: null }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).min("age");
    expect(result).toBe(0);
  });
});

describe("QueryExecutor.max", () => {
  test("executes MAX query", async () => {
    const { executor, calls, mockReturn } = createMockExecutor();
    mockReturn([{ result: 65 }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).max("age");
    expect(result).toBe(65);
    expect(calls[0]!.text).toBe("SELECT MAX(age) as result FROM users");
  });

  test("returns 0 when no rows", async () => {
    const { executor, mockReturn } = createMockExecutor();
    mockReturn([{ result: null }]);

    const db = createDatabase({ executor });
    const result = await db.query(UserModel).max("age");
    expect(result).toBe(0);
  });
});

describe("QueryExecutor.batchInsert", () => {
  test("inserts multiple rows", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel).batchInsert([
      { name: "Alice", email: "alice@test.com" },
      { name: "Bob", email: "bob@test.com" },
    ], ["name", "email"]);

    expect(calls[0]!.text).toBe(
      "INSERT INTO users (name, email) VALUES ($1, $2), ($3, $4)",
    );
    expect(calls[0]!.params).toEqual(["Alice", "alice@test.com", "Bob", "bob@test.com"]);
  });

  test("infers fields from first row when not specified", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel).batchInsert([
      { name: "Alice", email: "alice@test.com" },
      { name: "Bob", email: "bob@test.com" },
    ]);

    expect(calls[0]!.text).toBe(
      "INSERT INTO users (name, email) VALUES ($1, $2), ($3, $4)",
    );
  });

  test("empty rows does nothing", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel).batchInsert([]);

    expect(calls.length).toBe(0);
  });
});

describe("QueryExecutor.hardDelete", () => {
  test("hard delete on softDelete model", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).hardDelete();

    expect(calls[0]!.text).toBe("DELETE FROM posts WHERE id = $1");
    expect(calls[0]!.params).toEqual([1]);
  });

  test("hard delete on non-softDelete model", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel).where("id", "=", 1).hardDelete();

    expect(calls[0]!.text).toBe("DELETE FROM users WHERE id = $1");
    expect(calls[0]!.params).toEqual([1]);
  });
});

describe("QueryExecutor.restore", () => {
  test("restores soft-deleted record", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).restore();

    expect(calls[0]!.text).toBe("UPDATE posts SET deleted_at = NULL WHERE id = $1");
    expect(calls[0]!.params).toEqual([1]);
  });
});

describe("QueryExecutor.withDeleted", () => {
  test("includes deleted records in query", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).withDeleted().list();

    expect(calls[0]!.text).toBe("SELECT * FROM posts");
    expect(calls[0]!.params).toEqual([]);
  });

  test("without withDeleted filters deleted records", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).list();

    expect(calls[0]!.text).toBe("SELECT * FROM posts WHERE deleted_at IS NULL");
  });

  test("withDeleted with where clause", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).withDeleted().where("userId", "=", 1).list();

    expect(calls[0]!.text).toBe("SELECT * FROM posts WHERE userId = $1");
    expect(calls[0]!.params).toEqual([1]);
  });
});

describe("QueryExecutor.orWhere", () => {
  test("orWhere chains correctly", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel)
      .where("name", "=", "Alice")
      .orWhere("name", "=", "Bob")
      .list();

    expect(calls[0]!.text).toBe("SELECT * FROM users WHERE name = $1 OR name = $2");
    expect(calls[0]!.params).toEqual(["Alice", "Bob"]);
  });
});

describe("QueryExecutor.groupBy and having", () => {
  test("groupBy with having", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(UserModel)
      .select("age", "COUNT(*) as count")
      .groupBy("age")
      .having("COUNT(*)", ">", 1)
      .list();

    expect(calls[0]!.text).toBe(
      "SELECT age, COUNT(*) as count FROM users GROUP BY age HAVING COUNT(*) > $1",
    );
    expect(calls[0]!.params).toEqual([1]);
  });
});

describe("QueryExecutor.delete with force", () => {
  test("force delete on softDelete model uses hardDelete", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).delete({ force: true });

    expect(calls[0]!.text).toBe("DELETE FROM posts WHERE id = $1");
    expect(calls[0]!.params).toEqual([1]);
  });

  test("normal delete on softDelete model uses soft delete", async () => {
    const { executor, calls } = createMockExecutor();

    const db = createDatabase({ executor });
    await db.query(PostModel).where("id", "=", 1).delete();

    expect(calls[0]!.text).toBe(
      "UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
    );
    expect(calls[0]!.params).toEqual([1]);
  });
});
