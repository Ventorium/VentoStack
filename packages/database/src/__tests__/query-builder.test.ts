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
  },
  { softDelete: true },
);

describe("createQueryBuilder", () => {
  describe("SELECT queries", () => {
    test("basic select all", () => {
      const qb = createQueryBuilder(UserModel);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users");
      expect(params).toEqual([]);
    });

    test("select specific fields", () => {
      const qb = createQueryBuilder(UserModel).select("id", "name");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT id, name FROM users");
      expect(params).toEqual([]);
    });

    test("where with equals", () => {
      const qb = createQueryBuilder(UserModel).where("id", "=", 1);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE id = $1");
      expect(params).toEqual([1]);
    });

    test("where with not equals", () => {
      const qb = createQueryBuilder(UserModel).where("name", "!=", "admin");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE name != $1");
      expect(params).toEqual(["admin"]);
    });

    test("where with comparison operators", () => {
      const qb = createQueryBuilder(UserModel)
        .where("age", ">=", 18)
        .where("age", "<", 65);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE age >= $1 AND age < $2");
      expect(params).toEqual([18, 65]);
    });

    test("where with LIKE", () => {
      const qb = createQueryBuilder(UserModel).where("name", "LIKE", "%john%");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE name LIKE $1");
      expect(params).toEqual(["%john%"]);
    });

    test("where with IN", () => {
      const qb = createQueryBuilder(UserModel).where("id", "IN", [1, 2, 3]);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE id IN ($1, $2, $3)");
      expect(params).toEqual([1, 2, 3]);
    });

    test("where with IS NULL", () => {
      const qb = createQueryBuilder(UserModel).where("age", "IS NULL");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE age IS NULL");
      expect(params).toEqual([]);
    });

    test("where with IS NOT NULL", () => {
      const qb = createQueryBuilder(UserModel).where("age", "IS NOT NULL");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE age IS NOT NULL");
      expect(params).toEqual([]);
    });

    test("multiple where conditions (AND)", () => {
      const qb = createQueryBuilder(UserModel)
        .where("name", "=", "john")
        .where("age", ">", 20);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users WHERE name = $1 AND age > $2");
      expect(params).toEqual(["john", 20]);
    });

    test("orderBy ascending (default)", () => {
      const qb = createQueryBuilder(UserModel).orderBy("name");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users ORDER BY name ASC");
      expect(params).toEqual([]);
    });

    test("orderBy descending", () => {
      const qb = createQueryBuilder(UserModel).orderBy("id", "desc");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users ORDER BY id DESC");
      expect(params).toEqual([]);
    });

    test("multiple orderBy", () => {
      const qb = createQueryBuilder(UserModel)
        .orderBy("name", "asc")
        .orderBy("id", "desc");
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users ORDER BY name ASC, id DESC");
      expect(params).toEqual([]);
    });

    test("limit", () => {
      const qb = createQueryBuilder(UserModel).limit(10);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users LIMIT $1");
      expect(params).toEqual([10]);
    });

    test("offset", () => {
      const qb = createQueryBuilder(UserModel).limit(10).offset(20);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM users LIMIT $1 OFFSET $2");
      expect(params).toEqual([10, 20]);
    });

    test("combined query", () => {
      const qb = createQueryBuilder(UserModel)
        .select("id", "name")
        .where("age", ">=", 18)
        .orderBy("name")
        .limit(10)
        .offset(0);
      const { text, params } = qb.toSQL();
      expect(text).toBe(
        "SELECT id, name FROM users WHERE age >= $1 ORDER BY name ASC LIMIT $2 OFFSET $3",
      );
      expect(params).toEqual([18, 10, 0]);
    });
  });

  describe("softDelete", () => {
    test("auto-injects deleted_at IS NULL for select", () => {
      const qb = createQueryBuilder(PostModel);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM posts WHERE deleted_at IS NULL");
      expect(params).toEqual([]);
    });

    test("softDelete with additional where", () => {
      const qb = createQueryBuilder(PostModel).where("userId", "=", 5);
      const { text, params } = qb.toSQL();
      expect(text).toBe("SELECT * FROM posts WHERE userId = $1 AND deleted_at IS NULL");
      expect(params).toEqual([5]);
    });

    test("non-softDelete model does not inject deleted_at", () => {
      const qb = createQueryBuilder(UserModel);
      const { text } = qb.toSQL();
      expect(text).not.toContain("deleted_at");
    });
  });

  describe("INSERT queries", () => {
    test("basic insert", () => {
      const qb = createQueryBuilder(UserModel).insertData({
        name: "John",
        email: "john@example.com",
        age: 30,
      });
      const { text, params } = qb.toSQL();
      expect(text).toBe("INSERT INTO users (name, email, age) VALUES ($1, $2, $3)");
      expect(params).toEqual(["John", "john@example.com", 30]);
    });

    test("getOperation returns insert", () => {
      const qb = createQueryBuilder(UserModel).insertData({ name: "test" });
      expect(qb.getOperation()).toBe("insert");
    });
  });

  describe("UPDATE queries", () => {
    test("update with where", () => {
      const qb = createQueryBuilder(UserModel)
        .where("id", "=", 1)
        .updateData({ name: "Jane", age: 25 });
      const { text, params } = qb.toSQL();
      expect(text).toBe("UPDATE users SET name = $1, age = $2 WHERE id = $3");
      expect(params).toEqual(["Jane", 25, 1]);
    });

    test("update on softDelete model includes deleted_at IS NULL", () => {
      const qb = createQueryBuilder(PostModel)
        .where("id", "=", 1)
        .updateData({ title: "New Title" });
      const { text, params } = qb.toSQL();
      expect(text).toBe(
        "UPDATE posts SET title = $1 WHERE id = $2 AND deleted_at IS NULL",
      );
      expect(params).toEqual(["New Title", 1]);
    });

    test("getOperation returns update", () => {
      const qb = createQueryBuilder(UserModel).updateData({ name: "test" });
      expect(qb.getOperation()).toBe("update");
    });
  });

  describe("DELETE queries", () => {
    test("hard delete", () => {
      const qb = createQueryBuilder(UserModel).where("id", "=", 1).deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe("DELETE FROM users WHERE id = $1");
      expect(params).toEqual([1]);
    });

    test("soft delete generates UPDATE with NOW()", () => {
      const qb = createQueryBuilder(PostModel).where("id", "=", 1).deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe(
        "UPDATE posts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
      );
      expect(params).toEqual([1]);
    });

    test("delete without where", () => {
      const qb = createQueryBuilder(UserModel).deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe("DELETE FROM users");
      expect(params).toEqual([]);
    });

    test("getOperation returns delete", () => {
      const qb = createQueryBuilder(UserModel).deleteQuery();
      expect(qb.getOperation()).toBe("delete");
    });
  });

  describe("immutability", () => {
    test("chaining creates new builders", () => {
      const qb1 = createQueryBuilder(UserModel);
      const qb2 = qb1.where("id", "=", 1);
      const qb3 = qb1.where("name", "=", "John");

      const sql1 = qb1.toSQL();
      const sql2 = qb2.toSQL();
      const sql3 = qb3.toSQL();

      expect(sql1.text).toBe("SELECT * FROM users");
      expect(sql2.text).toBe("SELECT * FROM users WHERE id = $1");
      expect(sql3.text).toBe("SELECT * FROM users WHERE name = $1");
    });
  });

  describe("getOperation", () => {
    test("default is select", () => {
      const qb = createQueryBuilder(UserModel);
      expect(qb.getOperation()).toBe("select");
    });
  });

  describe("UPDATE with complex WHERE", () => {
    test("update with IN condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("id", "IN", [1, 2, 3])
        .updateData({ name: "Updated" });
      const { text, params } = qb.toSQL();
      expect(text).toBe("UPDATE users SET name = $1 WHERE id IN ($2, $3, $4)");
      expect(params).toEqual(["Updated", 1, 2, 3]);
    });

    test("update with IS NULL condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("age", "IS NULL")
        .updateData({ age: 25 });
      const { text, params } = qb.toSQL();
      expect(text).toBe("UPDATE users SET age = $1 WHERE age IS NULL");
      expect(params).toEqual([25]);
    });

    test("update with IS NOT NULL condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("age", "IS NOT NULL")
        .updateData({ name: "Updated" });
      const { text, params } = qb.toSQL();
      expect(text).toBe("UPDATE users SET name = $1 WHERE age IS NOT NULL");
      expect(params).toEqual(["Updated"]);
    });
  });

  describe("DELETE with complex WHERE", () => {
    test("hard delete with IN condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("id", "IN", [1, 2])
        .deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe("DELETE FROM users WHERE id IN ($1, $2)");
      expect(params).toEqual([1, 2]);
    });

    test("hard delete with IS NULL condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("age", "IS NULL")
        .deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe("DELETE FROM users WHERE age IS NULL");
      expect(params).toEqual([]);
    });

    test("hard delete with IS NOT NULL condition", () => {
      const qb = createQueryBuilder(UserModel)
        .where("age", "IS NOT NULL")
        .deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe("DELETE FROM users WHERE age IS NOT NULL");
      expect(params).toEqual([]);
    });

    test("soft delete with IN condition", () => {
      const qb = createQueryBuilder(PostModel)
        .where("userId", "IN", [1, 2])
        .deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe(
        "UPDATE posts SET deleted_at = NOW() WHERE userId IN ($1, $2) AND deleted_at IS NULL",
      );
      expect(params).toEqual([1, 2]);
    });

    test("soft delete with IS NOT NULL condition", () => {
      const qb = createQueryBuilder(PostModel)
        .where("title", "IS NOT NULL")
        .deleteQuery();
      const { text, params } = qb.toSQL();
      expect(text).toBe(
        "UPDATE posts SET deleted_at = NOW() WHERE title IS NOT NULL AND deleted_at IS NULL",
      );
      expect(params).toEqual([]);
    });
  });
});
