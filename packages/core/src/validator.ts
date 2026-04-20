// @aeron/core - Schema 验证器

import type { Context } from "./context";
import type { Middleware } from "./middleware";

export type FieldType = "string" | "number" | "boolean" | "array" | "object";

export interface FieldRule {
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: readonly unknown[];
  items?: FieldRule;
  properties?: Record<string, FieldRule>;
  custom?: (value: unknown) => string | null;
}

export type Schema = Record<string, FieldRule>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateField(
  value: unknown,
  rule: FieldRule,
  path: string,
): string[] {
  const errors: string[] = [];

  // required check
  if (value === null || value === undefined) {
    if (rule.required) {
      errors.push(`${path} is required`);
    }
    return errors;
  }

  // type check
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be of type array`);
      return errors;
    }
  } else if (rule.type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be of type object`);
      return errors;
    }
  } else if (typeof value !== rule.type) {
    errors.push(`${path} must be of type ${rule.type}`);
    return errors;
  }

  // min/max for string
  if (rule.type === "string" && typeof value === "string") {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`${path} must have at least ${rule.min} characters`);
    }
    if (rule.max !== undefined && value.length > rule.max) {
      errors.push(`${path} must have at most ${rule.max} characters`);
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${path} does not match pattern`);
    }
  }

  // min/max for number
  if (rule.type === "number" && typeof value === "number") {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${path} must be at least ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${path} must be at most ${rule.max}`);
    }
  }

  // min/max for array
  if (rule.type === "array" && Array.isArray(value)) {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`${path} must have at least ${rule.min} items`);
    }
    if (rule.max !== undefined && value.length > rule.max) {
      errors.push(`${path} must have at most ${rule.max} items`);
    }
    // items validation
    if (rule.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...validateField(value[i], rule.items, `${path}[${i}]`));
      }
    }
  }

  // enum check
  if (rule.enum !== undefined && !rule.enum.includes(value)) {
    errors.push(`${path} must be one of: ${rule.enum.join(", ")}`);
  }

  // properties for object
  if (rule.type === "object" && rule.properties && typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const [key, subRule] of Object.entries(rule.properties)) {
      errors.push(...validateField(obj[key], subRule, `${path}.${key}`));
    }
  }

  // custom validator
  if (rule.custom) {
    const customError = rule.custom(value);
    if (customError !== null) {
      errors.push(`${path}: ${customError}`);
    }
  }

  return errors;
}

export function validate(data: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["data must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;
  for (const [key, rule] of Object.entries(schema)) {
    errors.push(...validateField(obj[key], rule, key));
  }

  return { valid: errors.length === 0, errors };
}

export function validateBody(schema: Schema): Middleware {
  return async (ctx: Context, next) => {
    let body: unknown;
    try {
      body = await ctx.request.clone().json();
    } catch {
      return ctx.json({ error: "Invalid JSON body" }, 400);
    }

    const result = validate(body, schema);
    if (!result.valid) {
      return ctx.json({ errors: result.errors }, 400);
    }

    return next();
  };
}

export function validateQuery(schema: Schema): Middleware {
  return async (ctx: Context, next) => {
    const result = validate(ctx.query, schema);
    if (!result.valid) {
      return ctx.json({ errors: result.errors }, 400);
    }

    return next();
  };
}
