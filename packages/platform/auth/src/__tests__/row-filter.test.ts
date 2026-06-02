import { describe, expect, test } from "bun:test";
import { createRowFilter } from "../row-filter";

describe("createRowFilter", () => {
  test("addRule and getRules", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });
    expect(rf.getRules()).toHaveLength(1);
  });

  test("getFilters for matching resource", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });
    const filters = rf.getFilters("users", { tenantId: "t1" });
    expect(filters).toHaveLength(1);
    expect(filters[0].field).toBe("tenant_id");
    expect(filters[0].operator).toBe("=");
    expect(filters[0].value).toBe("t1");
  });

  test("getFilters for wildcard resource", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "*",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });
    const filters = rf.getFilters("anything", { tenantId: "t1" });
    expect(filters).toHaveLength(1);
  });

  test("getFilters for non-matching resource", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "orders",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });
    const filters = rf.getFilters("users", { tenantId: "t1" });
    expect(filters).toHaveLength(0);
  });

  test("valueFrom user", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "posts",
      field: "user_id",
      operator: "eq",
      valueFrom: "user",
      value: "user_id",
    });
    const filters = rf.getFilters("posts", { userId: "u1" });
    expect(filters[0].value).toBe("u1");
  });

  test("valueFrom static", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "posts",
      field: "status",
      operator: "eq",
      valueFrom: "static",
      value: "active",
    });
    const filters = rf.getFilters("posts", {});
    expect(filters[0].value).toBe("active");
  });

  test("operator mapping", () => {
    const rf = createRowFilter();
    rf.addRule({ resource: "t", field: "a", operator: "neq", valueFrom: "static", value: "x" });
    rf.addRule({ resource: "t", field: "b", operator: "in", valueFrom: "static", value: "y" });
    rf.addRule({ resource: "t", field: "c", operator: "not_in", valueFrom: "static", value: "z" });
    const filters = rf.getFilters("t", {});
    expect(filters[0].operator).toBe("!=");
    expect(filters[1].operator).toBe("IN");
    expect(filters[2].operator).toBe("NOT IN");
  });

  test("buildWhereClause", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });
    const clause = rf.buildWhereClause("users", { tenantId: "t1" });
    expect(clause.sql).toBe("WHERE tenant_id = $1");
    expect(clause.params).toEqual(["t1"]);
  });

  test("buildWhereClause with IN operator", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "role",
      operator: "in",
      valueFrom: "static",
      value: "admin",
    });
    const clause = rf.buildWhereClause("users", {});
    expect(clause.sql).toContain("IN");
    expect(clause.params).toEqual(["admin"]);
  });

  test("buildWhereClause empty for no matching rules", () => {
    const rf = createRowFilter();
    const clause = rf.buildWhereClause("users", {});
    expect(clause.sql).toBe("");
    expect(clause.params).toEqual([]);
  });

  test("buildWhereClause uses parameterized query to prevent injection", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });

    const clause = rf.buildWhereClause("users", { tenantId: "t' OR '1'='1" });
    expect(clause.sql).toBe("WHERE tenant_id = $1");
    expect(clause.params).toEqual(["t' OR '1'='1"]);
  });

  test("buildWhereClause fails closed when tenant context is missing", () => {
    const rf = createRowFilter();
    rf.addRule({
      resource: "users",
      field: "tenant_id",
      operator: "eq",
      valueFrom: "tenant",
      value: "tenant_id",
    });

    const clause = rf.buildWhereClause("users", {});
    expect(clause.sql).toBe("WHERE 1 = 0");
    expect(clause.params).toEqual([]);
  });

  test("addRule rejects unsafe SQL identifiers", () => {
    const rf = createRowFilter();
    expect(() =>
      rf.addRule({
        resource: "users",
        field: "tenant_id; DROP TABLE users",
        operator: "eq",
        valueFrom: "tenant",
        value: "tenant_id",
      }),
    ).toThrow("Unsafe SQL identifier");
  });

  test("multiple rules join with AND", () => {
    const rf = createRowFilter();
    rf.addRule({ resource: "t", field: "a", operator: "eq", valueFrom: "static", value: "1" });
    rf.addRule({ resource: "t", field: "b", operator: "eq", valueFrom: "static", value: "2" });
    const clause = rf.buildWhereClause("t", {});
    expect(clause.sql).toContain("AND");
    expect(clause.params).toEqual(["1", "2"]);
  });
});
