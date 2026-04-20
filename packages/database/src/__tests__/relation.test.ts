import { describe, expect, test } from "bun:test";
import { column, defineModel } from "../model";
import { defineRelation, buildJoinSQL, buildEagerLoadSQL } from "../relation";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  name: column.varchar({ length: 100 }),
  email: column.varchar({ length: 255 }),
});

const PostModel = defineModel("posts", {
  id: column.bigint({ primary: true }),
  title: column.varchar({ length: 200 }),
  userId: column.bigint(),
});

const TagModel = defineModel("tags", {
  id: column.bigint({ primary: true }),
  name: column.varchar({ length: 50 }),
});

const ProfileModel = defineModel("profiles", {
  id: column.bigint({ primary: true }),
  userId: column.bigint(),
  bio: column.text(),
});

describe("defineRelation", () => {
  test("hasOne relation", () => {
    const rel = defineRelation("hasOne", ProfileModel, { foreignKey: "userId" });
    expect(rel.type).toBe("hasOne");
    expect(rel.model).toBe(ProfileModel);
    expect(rel.foreignKey).toBe("userId");
    expect(rel.localKey).toBe("id");
  });

  test("hasMany relation", () => {
    const rel = defineRelation("hasMany", PostModel, { foreignKey: "userId" });
    expect(rel.type).toBe("hasMany");
    expect(rel.model).toBe(PostModel);
    expect(rel.foreignKey).toBe("userId");
    expect(rel.localKey).toBe("id");
  });

  test("belongsTo relation", () => {
    const rel = defineRelation("belongsTo", UserModel, { foreignKey: "userId" });
    expect(rel.type).toBe("belongsTo");
    expect(rel.model).toBe(UserModel);
    expect(rel.foreignKey).toBe("userId");
    expect(rel.localKey).toBe("id");
  });

  test("belongsToMany relation", () => {
    const rel = defineRelation("belongsToMany", TagModel, {
      foreignKey: "postId",
      pivotTable: "post_tags",
      pivotForeignKey: "post_id",
      pivotRelatedKey: "tag_id",
    });
    expect(rel.type).toBe("belongsToMany");
    expect(rel.model).toBe(TagModel);
    expect(rel.foreignKey).toBe("postId");
    expect(rel.pivotTable).toBe("post_tags");
    expect(rel.pivotForeignKey).toBe("post_id");
    expect(rel.pivotRelatedKey).toBe("tag_id");
  });

  test("custom localKey", () => {
    const rel = defineRelation("hasOne", ProfileModel, {
      foreignKey: "userId",
      localKey: "uuid",
    });
    expect(rel.localKey).toBe("uuid");
  });

  test("belongsToMany requires pivotTable", () => {
    expect(() =>
      defineRelation("belongsToMany", TagModel, {
        foreignKey: "postId",
        pivotForeignKey: "post_id",
        pivotRelatedKey: "tag_id",
      }),
    ).toThrow("belongsToMany requires pivotTable");
  });

  test("belongsToMany requires pivotForeignKey", () => {
    expect(() =>
      defineRelation("belongsToMany", TagModel, {
        foreignKey: "postId",
        pivotTable: "post_tags",
        pivotRelatedKey: "tag_id",
      }),
    ).toThrow("belongsToMany requires pivotForeignKey");
  });

  test("belongsToMany requires pivotRelatedKey", () => {
    expect(() =>
      defineRelation("belongsToMany", TagModel, {
        foreignKey: "postId",
        pivotTable: "post_tags",
        pivotForeignKey: "post_id",
      }),
    ).toThrow("belongsToMany requires pivotRelatedKey");
  });
});

describe("buildJoinSQL", () => {
  test("hasOne join", () => {
    const rel = defineRelation("hasOne", ProfileModel, { foreignKey: "userId" });
    const sql = buildJoinSQL("users", rel);
    expect(sql).toBe("LEFT JOIN profiles ON profiles.userId = users.id");
  });

  test("hasMany join", () => {
    const rel = defineRelation("hasMany", PostModel, { foreignKey: "userId" });
    const sql = buildJoinSQL("users", rel);
    expect(sql).toBe("LEFT JOIN posts ON posts.userId = users.id");
  });

  test("belongsTo join", () => {
    const rel = defineRelation("belongsTo", UserModel, { foreignKey: "userId" });
    const sql = buildJoinSQL("posts", rel);
    expect(sql).toBe("LEFT JOIN users ON users.id = posts.userId");
  });

  test("belongsToMany join", () => {
    const rel = defineRelation("belongsToMany", TagModel, {
      foreignKey: "postId",
      pivotTable: "post_tags",
      pivotForeignKey: "post_id",
      pivotRelatedKey: "tag_id",
    });
    const sql = buildJoinSQL("posts", rel);
    expect(sql).toBe(
      "LEFT JOIN post_tags ON post_tags.post_id = posts.id LEFT JOIN tags ON tags.id = post_tags.tag_id",
    );
  });

  test("hasOne join with alias", () => {
    const rel = defineRelation("hasOne", ProfileModel, { foreignKey: "userId" });
    const sql = buildJoinSQL("users", rel, "p");
    expect(sql).toBe("LEFT JOIN profiles AS p ON p.userId = users.id");
  });

  test("belongsTo join with alias", () => {
    const rel = defineRelation("belongsTo", UserModel, { foreignKey: "userId" });
    const sql = buildJoinSQL("posts", rel, "u");
    expect(sql).toBe("LEFT JOIN users AS u ON u.id = posts.userId");
  });

  test("belongsToMany join with alias", () => {
    const rel = defineRelation("belongsToMany", TagModel, {
      foreignKey: "postId",
      pivotTable: "post_tags",
      pivotForeignKey: "post_id",
      pivotRelatedKey: "tag_id",
    });
    const sql = buildJoinSQL("posts", rel, "t");
    expect(sql).toBe(
      "LEFT JOIN post_tags ON post_tags.post_id = posts.id LEFT JOIN tags AS t ON t.id = post_tags.tag_id",
    );
  });

  test("hasOne join with custom localKey", () => {
    const rel = defineRelation("hasOne", ProfileModel, {
      foreignKey: "userId",
      localKey: "uuid",
    });
    const sql = buildJoinSQL("users", rel);
    expect(sql).toBe("LEFT JOIN profiles ON profiles.userId = users.uuid");
  });
});

describe("buildEagerLoadSQL", () => {
  test("hasOne eager load", () => {
    const rel = defineRelation("hasOne", ProfileModel, { foreignKey: "userId" });
    const { text, params } = buildEagerLoadSQL("users", rel, [1, 2, 3]);
    expect(text).toBe("SELECT * FROM profiles WHERE userId IN ($1, $2, $3)");
    expect(params).toEqual([1, 2, 3]);
  });

  test("hasMany eager load", () => {
    const rel = defineRelation("hasMany", PostModel, { foreignKey: "userId" });
    const { text, params } = buildEagerLoadSQL("users", rel, [10, 20]);
    expect(text).toBe("SELECT * FROM posts WHERE userId IN ($1, $2)");
    expect(params).toEqual([10, 20]);
  });

  test("belongsTo eager load", () => {
    const rel = defineRelation("belongsTo", UserModel, { foreignKey: "userId" });
    const { text, params } = buildEagerLoadSQL("posts", rel, [5, 6]);
    expect(text).toBe("SELECT * FROM users WHERE id IN ($1, $2)");
    expect(params).toEqual([5, 6]);
  });

  test("belongsToMany eager load", () => {
    const rel = defineRelation("belongsToMany", TagModel, {
      foreignKey: "postId",
      pivotTable: "post_tags",
      pivotForeignKey: "post_id",
      pivotRelatedKey: "tag_id",
    });
    const { text, params } = buildEagerLoadSQL("posts", rel, [1, 2]);
    expect(text).toBe(
      "SELECT tags.*, post_tags.post_id FROM tags LEFT JOIN post_tags ON post_tags.tag_id = tags.id WHERE post_tags.post_id IN ($1, $2)",
    );
    expect(params).toEqual([1, 2]);
  });

  test("eager load with single parent id", () => {
    const rel = defineRelation("hasMany", PostModel, { foreignKey: "userId" });
    const { text, params } = buildEagerLoadSQL("users", rel, [42]);
    expect(text).toBe("SELECT * FROM posts WHERE userId IN ($1)");
    expect(params).toEqual([42]);
  });
});
