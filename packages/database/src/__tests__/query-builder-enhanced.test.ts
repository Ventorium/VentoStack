import { describe, expect, test } from "bun:test";
import { column, defineModel } from "../model";
import { createQueryBuilder } from "../query-builder";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 100 }),
  email: column.varchar({ length: 255, unique: true }),
  age: column.int({ nullable: true }),
});

const PostModel = defineModel(
  "posts",
  {
    id: column.bigint({ primary: true }),
    title: column.varchar({ length: 200 }),
    userId: column.bigint(),
    version: column.int({ default: 1 }),
  },
  { softDelete: true },
);

describe("groupBy", () => {
  test("single field", () => {
    const qb = createQueryBuilder(UserModel)
      .select("age", "COUNT(*) as count")
      .groupBy("age");
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT age, COUNT(*) as count FROM users GROUP BY age");
    expect(params).toEqual([]);
  });

  test("multiple fields", () => {
    const qb = createQueryBuilder(UserModel)
      .select("age", "name", "COUNT(*) as count")
      .groupBy("age", "name");
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT age, name, COUNT(*) as count FROM users GROUP BY age, name");
    expect(params).toEqual([]);
  });

  test("groupBy with where", () => {
    const qb = createQueryBuilder(UserModel)
      .where("age", ">=", 18)
      .select("age", "COUNT(*) as count")
      .groupBy("age");
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "SELECT age, COUNT(*) as count FROM users WHERE age >= $1 GROUP BY age",
    );
    expect(params).toEqual([18]);
  });
});

describe("having", () => {
  test("having after groupBy", () => {
    const qb = createQueryBuilder(UserModel)
      .select("age", "COUNT(*) as count")
      .groupBy("age")
      .having("COUNT(*)", ">", 5);
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "SELECT age, COUNT(*) as count FROM users GROUP BY age HAVING COUNT(*) > $1",
    );
    expect(params).toEqual([5]);
  });

  test("multiple having conditions", () => {
    const qb = createQueryBuilder(UserModel)
      .select("age", "COUNT(*) as count", "AVG(age) as avg_age")
      .groupBy("age")
      .having("COUNT(*)", ">", 5)
      .having("AVG(age)", "<", 30);
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "SELECT age, COUNT(*) as count, AVG(age) as avg_age FROM users GROUP BY age HAVING COUNT(*) > $1 AND AVG(age) < $2",
    );
    expect(params).toEqual([5, 30]);
  });

  test("having with where and groupBy", () => {
    const qb = createQueryBuilder(UserModel)
      .where("name", "LIKE", "%a%")
      .select("age", "COUNT(*) as count")
      .groupBy("age")
      .having("COUNT(*)", ">=", 2);
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "SELECT age, COUNT(*) as count FROM users WHERE name LIKE $1 GROUP BY age HAVING COUNT(*) >= $2",
    );
    expect(params).toEqual(["%a%", 2]);
  });
});

describe("orWhere", () => {
  test("single orWhere", () => {
    const qb = createQueryBuilder(UserModel)
      .where("name", "=", "Alice")
      .orWhere("name", "=", "Bob");
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM users WHERE name = $1 OR name = $2");
    expect(params).toEqual(["Alice", "Bob"]);
  });

  test("mixed AND and OR", () => {
    const qb = createQueryBuilder(UserModel)
      .where("age", ">=", 18)
      .where("name", "=", "Alice")
      .orWhere("name", "=", "Bob");
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "SELECT * FROM users WHERE age >= $1 AND name = $2 OR name = $3",
    );
    expect(params).toEqual([18, "Alice", "Bob"]);
  });

  test("orWhere with IS NULL", () => {
    const qb = createQueryBuilder(UserModel)
      .where("name", "=", "Alice")
      .orWhere("age", "IS NULL");
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM users WHERE name = $1 OR age IS NULL");
    expect(params).toEqual(["Alice"]);
  });

  test("orWhere with IN", () => {
    const qb = createQueryBuilder(UserModel)
      .where("name", "=", "Alice")
      .orWhere("id", "IN", [1, 2, 3]);
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM users WHERE name = $1 OR id IN ($2, $3, $4)");
    expect(params).toEqual(["Alice", 1, 2, 3]);
  });
});

describe("batchInsert", () => {
  test("basic batch insert", () => {
    const qb = createQueryBuilder(UserModel).batchInsert(
      [
        { name: "Alice", email: "alice@test.com" },
        { name: "Bob", email: "bob@test.com" },
      ],
      ["name", "email"],
    );
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "INSERT INTO users (name, email) VALUES ($1, $2), ($3, $4)",
    );
    expect(params).toEqual(["Alice", "alice@test.com", "Bob", "bob@test.com"]);
  });

  test("batch insert with three rows", () => {
    const qb = createQueryBuilder(UserModel).batchInsert(
      [
        { name: "A", email: "a@t.com", age: 20 },
        { name: "B", email: "b@t.com", age: 25 },
        { name: "C", email: "c@t.com", age: 30 },
      ],
      ["name", "email", "age"],
    );
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "INSERT INTO users (name, email, age) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
    );
    expect(params).toEqual(["A", "a@t.com", 20, "B", "b@t.com", 25, "C", "c@t.com", 30]);
  });

  test("batch insert sets operation to insert", () => {
    const qb = createQueryBuilder(UserModel).batchInsert(
      [{ name: "Alice" }],
      ["name"],
    );
    expect(qb.getOperation()).toBe("insert");
  });
});

describe("withVersion", () => {
  test("adds version check to update", () => {
    const qb = createQueryBuilder(PostModel)
      .where("id", "=", 1)
      .withVersion("version", 3)
      .updateData({ title: "Updated" });
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "UPDATE posts SET title = $1, version = version + 1 WHERE id = $2 AND version = $3 AND deleted_at IS NULL",
    );
    expect(params).toEqual(["Updated", 1, 3]);
  });

  test("version on non-softdelete model", () => {
    const qb = createQueryBuilder(UserModel)
      .where("id", "=", 5)
      .withVersion("version", 1)
      .updateData({ name: "New" });
    const { text, params } = qb.toSQL();
    expect(text).toBe(
      "UPDATE users SET name = $1, version = version + 1 WHERE id = $2 AND version = $3",
    );
    expect(params).toEqual(["New", 5, 1]);
  });
});

describe("hardDelete", () => {
  test("hardDelete on softDelete model generates DELETE", () => {
    const qb = createQueryBuilder(PostModel).where("id", "=", 1).hardDelete();
    const { text, params } = qb.toSQL();
    expect(text).toBe("DELETE FROM posts WHERE id = $1");
    expect(params).toEqual([1]);
  });

  test("hardDelete on non-softDelete model generates DELETE", () => {
    const qb = createQueryBuilder(UserModel).where("id", "=", 1).hardDelete();
    const { text, params } = qb.toSQL();
    expect(text).toBe("DELETE FROM users WHERE id = $1");
    expect(params).toEqual([1]);
  });

  test("hardDelete without conditions", () => {
    const qb = createQueryBuilder(PostModel).hardDelete();
    const { text, params } = qb.toSQL();
    expect(text).toBe("DELETE FROM posts");
    expect(params).toEqual([]);
  });
});

describe("restore", () => {
  test("restore generates UPDATE SET deleted_at = NULL", () => {
    const qb = createQueryBuilder(PostModel).where("id", "=", 1).restore();
    const { text, params } = qb.toSQL();
    expect(text).toBe("UPDATE posts SET deleted_at = NULL WHERE id = $1");
    expect(params).toEqual([1]);
  });

  test("restore without conditions", () => {
    const qb = createQueryBuilder(PostModel).restore();
    const { text, params } = qb.toSQL();
    expect(text).toBe("UPDATE posts SET deleted_at = NULL");
    expect(params).toEqual([]);
  });
});

describe("withDeleted", () => {
  test("withDeleted skips deleted_at IS NULL filter on select", () => {
    const qb = createQueryBuilder(PostModel).withDeleted();
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM posts");
    expect(params).toEqual([]);
  });

  test("without withDeleted, softDelete model adds filter", () => {
    const qb = createQueryBuilder(PostModel);
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM posts WHERE deleted_at IS NULL");
    expect(params).toEqual([]);
  });

  test("withDeleted with additional where", () => {
    const qb = createQueryBuilder(PostModel)
      .withDeleted()
      .where("userId", "=", 1);
    const { text, params } = qb.toSQL();
    expect(text).toBe("SELECT * FROM posts WHERE userId = $1");
    expect(params).toEqual([1]);
  });

  test("withDeleted on update", () => {
    const qb = createQueryBuilder(PostModel)
      .withDeleted()
      .where("id", "=", 1)
      .updateData({ title: "Updated" });
    const { text, params } = qb.toSQL();
    expect(text).toBe("UPDATE posts SET title = $1 WHERE id = $2");
    expect(params).toEqual(["Updated", 1]);
  });
});

describe("immutability", () => {
  test("orWhere does not mutate original builder", () => {
    const qb1 = createQueryBuilder(UserModel).where("name", "=", "Alice");
    const qb2 = qb1.orWhere("name", "=", "Bob");
    expect(qb1.toSQL().text).toBe("SELECT * FROM users WHERE name = $1");
    expect(qb2.toSQL().text).toBe("SELECT * FROM users WHERE name = $1 OR name = $2");
  });

  test("groupBy does not mutate original builder", () => {
    const qb1 = createQueryBuilder(UserModel).select("age");
    const qb2 = qb1.groupBy("age");
    expect(qb1.toSQL().text).toBe("SELECT age FROM users");
    expect(qb2.toSQL().text).toBe("SELECT age FROM users GROUP BY age");
  });

  test("withDeleted does not mutate original builder", () => {
    const qb1 = createQueryBuilder(PostModel);
    const qb2 = qb1.withDeleted();
    expect(qb1.toSQL().text).toContain("deleted_at IS NULL");
    expect(qb2.toSQL().text).not.toContain("deleted_at IS NULL");
  });
});
