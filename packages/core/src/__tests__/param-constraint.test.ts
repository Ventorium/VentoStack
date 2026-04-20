import { describe, test, expect } from "bun:test";
import { createParamValidator, paramConstraints } from "../param-constraint";

describe("paramConstraints", () => {
  test("id matches numbers", () => {
    expect(paramConstraints.id.pattern.test("123")).toBe(true);
    expect(paramConstraints.id.pattern.test("0")).toBe(true);
    expect(paramConstraints.id.pattern.test("abc")).toBe(false);
    expect(paramConstraints.id.pattern.test("12.3")).toBe(false);
  });

  test("uuid matches valid UUIDs", () => {
    expect(paramConstraints.uuid.pattern.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(paramConstraints.uuid.pattern.test("not-a-uuid")).toBe(false);
  });

  test("slug matches valid slugs", () => {
    expect(paramConstraints.slug.pattern.test("hello-world")).toBe(true);
    expect(paramConstraints.slug.pattern.test("abc123")).toBe(true);
    expect(paramConstraints.slug.pattern.test("Hello-World")).toBe(false);
    expect(paramConstraints.slug.pattern.test("with spaces")).toBe(false);
  });

  test("numeric matches numbers", () => {
    expect(paramConstraints.numeric.pattern.test("42")).toBe(true);
    expect(paramConstraints.numeric.pattern.test("-3.14")).toBe(true);
    expect(paramConstraints.numeric.pattern.test("abc")).toBe(false);
  });
});

describe("createParamValidator", () => {
  test("validates params with builtin constraints", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      { id: "123", slug: "hello-world" },
      { id: "id", slug: "slug" },
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("reports errors for invalid params", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      { id: "abc" },
      { id: "id" },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.param).toBe("id");
    expect(result.errors[0]!.value).toBe("abc");
  });

  test("validates with custom constraint", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      { code: "AB12" },
      { code: { pattern: /^[A-Z]{2}\d{2}$/, message: "Invalid code" } },
    );
    expect(result.valid).toBe(true);
  });

  test("reports custom constraint error", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      { code: "invalid" },
      { code: { pattern: /^[A-Z]{2}\d{2}$/, message: "Invalid code" } },
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toBe("Invalid code");
  });

  test("skips undefined params", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      {},
      { id: "id" },
    );
    expect(result.valid).toBe(true);
  });

  test("multiple param errors", () => {
    const validator = createParamValidator();
    const result = validator.validate(
      { id: "abc", slug: "UPPER CASE" },
      { id: "id", slug: "slug" },
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
