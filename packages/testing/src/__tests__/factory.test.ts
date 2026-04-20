import { describe, expect, test } from "bun:test";
import { defineFactory, sequence, oneOf, uuid } from "../factory";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  age: number;
}

const userFactory = defineFactory<User>({
  fields: {
    id: uuid(),
    name: sequence("user"),
    email: sequence("email"),
    role: "viewer",
    age: 25,
  },
});

describe("defineFactory", () => {
  test("build returns object with resolved fields", () => {
    const user = userFactory.build();
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("name");
    expect(user).toHaveProperty("email");
    expect(user.role).toBe("viewer");
    expect(user.age).toBe(25);
  });

  test("build applies overrides", () => {
    const user = userFactory.build({ name: "Alice", age: 30 });
    expect(user.name).toBe("Alice");
    expect(user.age).toBe(30);
    expect(user.role).toBe("viewer");
  });

  test("build calls generator functions each time", () => {
    const a = userFactory.build();
    const b = userFactory.build();
    expect(a.id).not.toBe(b.id);
  });

  test("buildMany returns correct count", () => {
    const users = userFactory.buildMany(5);
    expect(users).toHaveLength(5);
  });

  test("buildMany applies overrides to all items", () => {
    const users = userFactory.buildMany(3, { role: "admin" });
    for (const u of users) {
      expect(u.role).toBe("admin");
    }
  });

  test("buildSequence passes index to callback", () => {
    const users = userFactory.buildSequence(3, (i) => ({
      name: `user-${i}`,
      age: 20 + i,
    }));
    expect(users[0]!.name).toBe("user-0");
    expect(users[1]!.name).toBe("user-1");
    expect(users[2]!.age).toBe(22);
  });
});

describe("sequence", () => {
  test("returns incrementing values with prefix", () => {
    const gen = sequence("item");
    expect(gen()).toBe("item_1");
    expect(gen()).toBe("item_2");
    expect(gen()).toBe("item_3");
  });

  test("uses default prefix when none given", () => {
    const gen = sequence();
    expect(gen()).toBe("item_1");
  });
});

describe("oneOf", () => {
  test("returns value from provided options", () => {
    const gen = oneOf("a", "b", "c");
    const results = new Set(Array.from({ length: 100 }, () => gen()));
    // All results must be one of the provided values
    for (const r of results) {
      expect(["a", "b", "c"]).toContain(r);
    }
  });

  test("single value always returns that value", () => {
    const gen = oneOf("only");
    expect(gen()).toBe("only");
    expect(gen()).toBe("only");
  });
});

describe("uuid", () => {
  test("returns valid UUID strings", () => {
    const gen = uuid();
    const id = gen();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("returns unique values", () => {
    const gen = uuid();
    const ids = new Set(Array.from({ length: 10 }, () => gen()));
    expect(ids.size).toBe(10);
  });
});
