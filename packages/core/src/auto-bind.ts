// @aeron/core - 自动绑定（JSON / Form → Struct）

import type { Context } from "./context";
import type { Schema, ValidationResult } from "./validator";
import { validate } from "./validator";

export interface BindOptions {
  /** 最大 JSON body 大小（字节） */
  maxBodySize?: number;
  /** JSON 最大嵌套深度 */
  maxDepth?: number;
}

export interface BindResult<T> {
  data: T;
  errors: string[];
}

const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_DEPTH = 10;

function checkDepth(obj: unknown, maxDepth: number, current = 0): boolean {
  if (current > maxDepth) return false;
  if (typeof obj !== "object" || obj === null) return true;
  if (Array.isArray(obj)) {
    return obj.every((item) => checkDepth(item, maxDepth, current + 1));
  }
  return Object.values(obj).every((val) => checkDepth(val, maxDepth, current + 1));
}

/**
 * 从 JSON body 解析并校验数据
 */
export async function bindJSON<T = Record<string, unknown>>(
  ctx: Context,
  schema: Schema,
  options?: BindOptions,
): Promise<BindResult<T>> {
  const maxSize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;

  const contentType = ctx.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { data: {} as T, errors: ["Content-Type must be application/json"] };
  }

  const contentLength = ctx.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    return { data: {} as T, errors: [`Body exceeds max size of ${maxSize} bytes`] };
  }

  let body: unknown;
  try {
    const text = await ctx.request.clone().text();
    if (text.length > maxSize) {
      return { data: {} as T, errors: [`Body exceeds max size of ${maxSize} bytes`] };
    }
    body = JSON.parse(text);
  } catch {
    return { data: {} as T, errors: ["Invalid JSON body"] };
  }

  if (!checkDepth(body, maxDepth)) {
    return { data: {} as T, errors: [`JSON exceeds max depth of ${maxDepth}`] };
  }

  const result = validate(body as Record<string, unknown>, schema);
  if (!result.valid) {
    return { data: {} as T, errors: result.errors };
  }

  return { data: body as T, errors: [] };
}

/**
 * 从 Form body (application/x-www-form-urlencoded) 解析并校验
 */
export async function bindForm<T = Record<string, unknown>>(
  ctx: Context,
  schema: Schema,
  options?: BindOptions,
): Promise<BindResult<T>> {
  const maxSize = options?.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  const contentType = ctx.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return { data: {} as T, errors: ["Content-Type must be application/x-www-form-urlencoded"] };
  }

  let text: string;
  try {
    text = await ctx.request.clone().text();
  } catch {
    return { data: {} as T, errors: ["Failed to read form body"] };
  }

  if (text.length > maxSize) {
    return { data: {} as T, errors: [`Body exceeds max size of ${maxSize} bytes`] };
  }

  const params = new URLSearchParams(text);
  const data: Record<string, unknown> = {};
  for (const [key, value] of params) {
    // 类型推断：根据 schema 类型做转换
    const fieldDef = schema[key];
    if (fieldDef) {
      if (fieldDef.type === "number") {
        data[key] = Number(value);
      } else if (fieldDef.type === "boolean") {
        data[key] = value === "true" || value === "1";
      } else {
        data[key] = value;
      }
    } else {
      data[key] = value;
    }
  }

  const result = validate(data, schema);
  if (!result.valid) {
    return { data: {} as T, errors: result.errors };
  }

  return { data: data as T, errors: [] };
}

/**
 * 从 query string 解析并校验
 */
export function bindQuery<T = Record<string, unknown>>(
  ctx: Context,
  schema: Schema,
): BindResult<T> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx.query)) {
    const fieldDef = schema[key];
    if (fieldDef) {
      if (fieldDef.type === "number") {
        data[key] = Number(value);
      } else if (fieldDef.type === "boolean") {
        data[key] = value === "true" || value === "1";
      } else {
        data[key] = value;
      }
    } else {
      data[key] = value;
    }
  }

  const result = validate(data, schema);
  if (!result.valid) {
    return { data: {} as T, errors: result.errors };
  }

  return { data: data as T, errors: [] };
}
