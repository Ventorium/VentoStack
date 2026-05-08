// @ventostack/core - Schema 类型推导与运行时校验
// 为路由配置提供统一的类型声明、编译期推导和运行时转换/校验

/** 支持的 schema 字段类型 */
export type SchemaFieldType =
  | "string"
  | "number"
  | "boolean"
  | "int"
  | "float"
  | "bool"
  | "uuid"
  | "date"
  | "array"
  | "object"
  | "file";

/** 字段定义（同时驱动类型推导、运行时校验和 OpenAPI 生成） */
export interface SchemaField {
  /** 字段类型 */
  type: SchemaFieldType;
  /** 是否必填 */
  required?: boolean;
  /** 默认值（存在时字段类型不含 undefined） */
  default?: unknown;
  /** 最小值/最小长度/最小元素数 */
  min?: number;
  /** 最大值/最大长度/最大元素数 */
  max?: number;
  /** 正则匹配 */
  pattern?: RegExp;
  /** 枚举值 */
  enum?: readonly unknown[];
  /** 数组元素规则 */
  items?: SchemaField;
  /** 对象属性规则 */
  properties?: Record<string, SchemaField>;
  /** 自定义校验函数 */
  custom?: (value: unknown) => string | null;
  /** OpenAPI: 字段描述 */
  description?: string;
  /** OpenAPI: 示例值 */
  example?: unknown;
  /** OpenAPI: 数据格式（如 date-time、email） */
  format?: string;
  /** 文件专用：允许的 MIME 类型 */
  allowedMimeTypes?: string[];
  /** 文件专用：允许的扩展名 */
  allowedExtensions?: string[];
  /** 文件专用：最大文件大小（字节） */
  maxSize?: number;
  /** 文件专用：最大文件数量 */
  maxFiles?: number;
}

/** 响应配置（用于声明非 JSON Content-Type 或补充描述） */
export interface RouteResponseConfig {
  /** 响应内容类型，例如 text/plain */
  contentType: string;
  /** 响应体 Schema */
  schema: Record<string, SchemaField> | SchemaField;
  /** OpenAPI: 响应描述 */
  description?: string;
}

/** 路由响应声明 */
export type RouteResponseDefinition = Record<string, SchemaField> | SchemaField | RouteResponseConfig;

/** 路由级 OpenAPI 元数据 */
export interface RouteOpenAPIConfig {
  /** 接口摘要 */
  summary?: string;
  /** 接口详细描述 */
  description?: string;
  /** 标签分类 */
  tags?: string[];
  /** 操作唯一标识 */
  operationId?: string;
  /** 是否已废弃 */
  deprecated?: boolean;
  /** 安全要求 */
  security?: Array<Record<string, string[]>>;
}

/** 路由 Schema 配置 */
export interface RouteSchemaConfig {
  /** 查询参数 Schema */
  query?: Record<string, SchemaField>;
  /** 请求体 Schema（JSON 或 form-urlencoded） */
  body?: Record<string, SchemaField>;
  /** 请求头 Schema */
  headers?: Record<string, SchemaField>;
  /** FormData Schema（multipart） */
  formData?: Record<string, SchemaField>;
  /** 响应 Schema（用于类型推导、运行时校验和 OpenAPI） */
  responses?: Record<number | string, RouteResponseDefinition>;
  /** OpenAPI 文档元数据 */
  openapi?: RouteOpenAPIConfig;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

// ---------- 编译期类型推导 ----------

type CoreType<T extends SchemaField> = T["type"] extends "string" | "uuid"
  ? string
  : T["type"] extends "int" | "float" | "number"
    ? number
    : T["type"] extends "bool" | "boolean"
      ? boolean
      : T["type"] extends "date"
        ? Date
        : T["type"] extends "file"
          ? File
          : T["type"] extends "array"
            ? T extends { items: infer I }
              ? I extends SchemaField
                ? CoreType<I>[]
                : unknown[]
              : unknown[]
            : T["type"] extends "object"
              ? T extends { properties: infer P }
                ? P extends Record<string, SchemaField>
                  ? InferSchema<P>
                  : Record<string, unknown>
                : Record<string, unknown>
              : unknown;

/** 从单个 SchemaField 推导 TypeScript 类型 */
export type InferFieldType<T extends SchemaField> = T extends { required: true }
  ? CoreType<T>
  : T extends { default: unknown }
    ? CoreType<T>
    : CoreType<T> | undefined;

/** 从 Schema 对象推导 TypeScript 类型 */
export type InferSchema<T extends Record<string, SchemaField> | undefined> =
  T extends Record<string, SchemaField>
    ? { [K in keyof T]: T[K] extends SchemaField ? InferFieldType<T[K]> : unknown }
    : Record<string, unknown>;

type ResponseSchemaOf<T> = T extends { contentType: string; schema: infer S } ? S : T;

/** 从响应 Schema 推导 TypeScript 类型（支持对象或单字段） */
export type InferResponseType<T> =
  ResponseSchemaOf<T> extends Record<string, SchemaField>
    ? InferSchema<ResponseSchemaOf<T>>
    : ResponseSchemaOf<T> extends SchemaField
      ? InferFieldType<ResponseSchemaOf<T>>
      : Record<string, unknown>;

export function isSchemaField(value: unknown): value is SchemaField {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value;
}

export function isRouteResponseConfig(value: unknown): value is RouteResponseConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "contentType" in value && "schema" in value;
}

export function resolveRouteResponseDefinition(
  definition: RouteResponseDefinition,
): { contentType: string; schema: Record<string, SchemaField> | SchemaField; description?: string } {
  if (isRouteResponseConfig(definition)) {
    return {
      contentType: definition.contentType,
      schema: definition.schema,
      ...(definition.description !== undefined ? { description: definition.description } : {}),
    };
  }

  return {
    contentType: "application/json",
    schema: definition,
  };
}

// ---------- 运行时转换 ----------

function coerceValue(value: unknown, field: SchemaField): unknown {
  if (value === null || value === undefined) return value;

  switch (field.type) {
    case "string":
    case "uuid":
      return String(value);
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "int": {
      const intVal = typeof value === "number" ? value : parseInt(String(value), 10);
      if (!Number.isFinite(intVal)) throw new Error("必须为整数");
      return intVal;
    }
    case "float": {
      const floatVal = typeof value === "number" ? value : parseFloat(String(value));
      if (!Number.isFinite(floatVal)) throw new Error("必须为数字");
      return floatVal;
    }
    case "boolean":
    case "bool": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value === "true" || value === "1";
      if (typeof value === "number") return value === 1;
      throw new Error("必须为布尔值");
    }
    case "date": {
      if (value instanceof Date) return value;
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new Error("必须为有效的日期");
      return d;
    }
    case "file": {
      if (value instanceof File) return value;
      throw new Error("必须为文件");
    }
    case "array": {
      if (Array.isArray(value)) return value;
      return [value];
    }
    case "object": {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
      throw new Error("必须为对象");
    }
    default:
      return value;
  }
}

function validateCoercedValue(value: unknown, field: SchemaField, path: string): string[] {
  const errors: string[] = [];

  // type check
  switch (field.type) {
    case "string":
    case "uuid":
      if (typeof value !== "string") errors.push(`${path} must be a string`);
      break;
    case "number":
    case "float":
      if (typeof value !== "number") errors.push(`${path} must be a number`);
      break;
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) errors.push(`${path} must be an integer`);
      break;
    case "boolean":
    case "bool":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      break;
    case "date":
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) errors.push(`${path} must be a valid date`);
      break;
    case "file":
      if (!(value instanceof File)) errors.push(`${path} must be a file`);
      break;
    case "array":
      if (!Array.isArray(value)) errors.push(`${path} must be an array`);
      break;
    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) errors.push(`${path} must be an object`);
      break;
  }

  if (errors.length > 0) return errors;

  // string / uuid checks
  if ((field.type === "string" || field.type === "uuid") && typeof value === "string") {
    if (field.min !== undefined && value.length < field.min) errors.push(`${path} must have at least ${field.min} characters`);
    if (field.max !== undefined && value.length > field.max) errors.push(`${path} must have at most ${field.max} characters`);
    if (field.pattern && !field.pattern.test(value)) errors.push(`${path} does not match pattern`);
    if (field.type === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      errors.push(`${path} must be a valid UUID`);
    }
  }

  // number / int / float checks
  if ((field.type === "number" || field.type === "int" || field.type === "float") && typeof value === "number") {
    if (field.min !== undefined && value < field.min) errors.push(`${path} must be at least ${field.min}`);
    if (field.max !== undefined && value > field.max) errors.push(`${path} must be at most ${field.max}`);
  }

  // array checks
  if (field.type === "array" && Array.isArray(value)) {
    if (field.min !== undefined && value.length < field.min) errors.push(`${path} must have at least ${field.min} items`);
    if (field.max !== undefined && value.length > field.max) errors.push(`${path} must have at most ${field.max} items`);
    if (field.items) {
      for (let i = 0; i < value.length; i++) {
        try {
          const coerced = coerceValue(value[i], field.items);
          errors.push(...validateCoercedValue(coerced, field.items, `${path}[${i}]`));
        } catch (err) {
          errors.push(`${path}[${i}]: ${err instanceof Error ? err.message : "invalid value"}`);
        }
      }
    }
  }

  // object checks
  if (field.type === "object" && field.properties && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const [propKey, propField] of Object.entries(field.properties)) {
      try {
        const coerced = coerceValue(obj[propKey], propField);
        errors.push(...validateCoercedValue(coerced, propField, `${path}.${propKey}`));
      } catch (err) {
        errors.push(`${path}.${propKey}: ${err instanceof Error ? err.message : "invalid value"}`);
      }
    }
  }

  // file checks
  if (field.type === "file" && value instanceof File) {
    if (field.maxSize !== undefined && value.size > field.maxSize) errors.push(`${path} exceeds max size of ${field.maxSize} bytes`);
    if (field.allowedMimeTypes && !field.allowedMimeTypes.includes(value.type)) {
      errors.push(`${path} MIME type not allowed: ${value.type}`);
    }
    if (field.allowedExtensions) {
      const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
      if (!field.allowedExtensions.includes(ext)) {
        errors.push(`${path} extension not allowed: .${ext}`);
      }
    }
  }

  // enum check
  if (field.enum !== undefined && !field.enum.includes(value)) {
    errors.push(`${path} must be one of: ${field.enum.join(", ")}`);
  }

  // custom validator
  if (field.custom) {
    const customError = field.custom(value);
    if (customError !== null) errors.push(`${path}: ${customError}`);
  }

  return errors;
}

function validateStrictValue(value: unknown, field: SchemaField, path: string): string[] {
  if (value === undefined) {
    return field.required ? [`${path} is required`] : [];
  }

  const errors: string[] = [];

  switch (field.type) {
    case "string":
    case "uuid":
      if (typeof value !== "string") errors.push(`${path} must be a string`);
      break;
    case "number":
    case "float":
      if (typeof value !== "number") errors.push(`${path} must be a number`);
      break;
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) errors.push(`${path} must be an integer`);
      break;
    case "boolean":
    case "bool":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      break;
    case "date":
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) errors.push(`${path} must be a valid date`);
      break;
    case "file":
      if (!(value instanceof File)) errors.push(`${path} must be a file`);
      break;
    case "array":
      if (!Array.isArray(value)) errors.push(`${path} must be an array`);
      break;
    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) errors.push(`${path} must be an object`);
      break;
  }

  if (errors.length > 0) return errors;

  if ((field.type === "string" || field.type === "uuid") && typeof value === "string") {
    if (field.min !== undefined && value.length < field.min) errors.push(`${path} must have at least ${field.min} characters`);
    if (field.max !== undefined && value.length > field.max) errors.push(`${path} must have at most ${field.max} characters`);
    if (field.pattern && !field.pattern.test(value)) errors.push(`${path} does not match pattern`);
    if (field.type === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      errors.push(`${path} must be a valid UUID`);
    }
  }

  if ((field.type === "number" || field.type === "int" || field.type === "float") && typeof value === "number") {
    if (field.min !== undefined && value < field.min) errors.push(`${path} must be at least ${field.min}`);
    if (field.max !== undefined && value > field.max) errors.push(`${path} must be at most ${field.max}`);
  }

  if (field.type === "array" && Array.isArray(value)) {
    if (field.min !== undefined && value.length < field.min) errors.push(`${path} must have at least ${field.min} items`);
    if (field.max !== undefined && value.length > field.max) errors.push(`${path} must have at most ${field.max} items`);
    if (field.items) {
      for (let i = 0; i < value.length; i += 1) {
        errors.push(...validateStrictValue(value[i], field.items, `${path}[${i}]`));
      }
    }
  }

  if (field.type === "object" && field.properties && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const [propKey, propField] of Object.entries(field.properties)) {
      errors.push(...validateStrictValue(obj[propKey], propField, `${path}.${propKey}`));
    }
  }

  if (field.type === "file" && value instanceof File) {
    if (field.maxSize !== undefined && value.size > field.maxSize) errors.push(`${path} exceeds max size of ${field.maxSize} bytes`);
    if (field.allowedMimeTypes && !field.allowedMimeTypes.includes(value.type)) {
      errors.push(`${path} MIME type not allowed: ${value.type}`);
    }
    if (field.allowedExtensions) {
      const ext = value.name.split(".").pop()?.toLowerCase() ?? "";
      if (!field.allowedExtensions.includes(ext)) {
        errors.push(`${path} extension not allowed: .${ext}`);
      }
    }
  }

  if (field.enum !== undefined && !field.enum.includes(value)) {
    errors.push(`${path} must be one of: ${field.enum.join(", ")}`);
  }

  if (field.custom) {
    const customError = field.custom(value);
    if (customError !== null) errors.push(`${path}: ${customError}`);
  }

  return errors;
}

export function validateResponseData(
  raw: unknown,
  schema: Record<string, SchemaField> | SchemaField,
  path = "response",
): string[] {
  if (isSchemaField(schema)) {
    return validateStrictValue(raw, schema, path);
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  const objectValue = raw as Record<string, unknown>;
  for (const [key, field] of Object.entries(schema)) {
    errors.push(...validateStrictValue(objectValue[key], field, `${path}.${key}`));
  }
  return errors;
}

/**
 * 从原始数据按 Schema 做类型转换与校验
 * @param raw - 原始数据（Record / FormData / Headers）
 * @param schema - Schema 定义
 * @returns 转换后的数据和错误列表
 */
export function coerceAndValidate(
  raw: Record<string, unknown> | globalThis.FormData | Headers,
  schema: Record<string, SchemaField>,
): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    let value: unknown;

    if (raw instanceof globalThis.FormData) {
      value = raw.get(key);
    } else if (raw instanceof Headers) {
      value = raw.get(key) ?? undefined;
      if (value === undefined) {
        const keys = Array.from(raw.keys());
        const matched = keys.find((k) => k.toLowerCase() === key.toLowerCase());
        if (matched) value = raw.get(matched);
      }
    } else {
      value = raw[key];
    }

    // required / default
    if (value === undefined || value === null || value === "") {
      if (field.required) {
        errors.push(`${key} is required`);
        continue;
      }
      if (field.default !== undefined) {
        value = field.default;
      } else {
        continue;
      }
    }

    // coerce
    try {
      value = coerceValue(value, field);
    } catch (err) {
      errors.push(`${key}: ${err instanceof Error ? err.message : "invalid value"}`);
      continue;
    }

    // validate
    const fieldErrors = validateCoercedValue(value, field, key);
    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
      continue;
    }

    data[key] = value;
  }

  return { data, errors };
}

/**
 * 解析 JSON body 并校验
 * @param request - Request 对象
 * @param schema - Schema 定义
 * @returns 转换后的数据和错误列表
 */
export async function coerceAndValidateJSONBody(
  request: Request,
  schema: Record<string, SchemaField>,
): Promise<{ data: Record<string, unknown>; errors: string[] }> {
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return { data: {}, errors: ["Invalid JSON body"] };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { data: {}, errors: ["Body must be a non-null object"] };
  }

  return coerceAndValidate(body as Record<string, unknown>, schema);
}

/**
 * 解析 form-urlencoded body 并校验
 * @param request - Request 对象
 * @param schema - Schema 定义
 * @returns 转换后的数据和错误列表
 */
export async function coerceAndValidateFormBody(
  request: Request,
  schema: Record<string, SchemaField>,
): Promise<{ data: Record<string, unknown>; errors: string[] }> {
  const text = await request.clone().text();
  const params = new URLSearchParams(text);
  const raw: Record<string, unknown> = {};
  for (const [k, v] of params) {
    raw[k] = v;
  }
  return coerceAndValidate(raw, schema);
}

/**
 * 解析 FormData body 并校验
 * @param request - Request 对象
 * @param schema - Schema 定义
 * @returns 转换后的数据和错误列表
 */
export async function coerceAndValidateFormDataBody(
  request: Request,
  schema: Record<string, SchemaField>,
): Promise<{ data: Record<string, unknown>; errors: string[] }> {
  let formData: globalThis.FormData;
  try {
    formData = (await request.clone().formData()) as globalThis.FormData;
  } catch {
    return { data: {}, errors: ["Failed to parse form data"] };
  }

  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    const existing = raw[k];
    if (existing === undefined) {
      raw[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
      raw[k] = existing;
    } else {
      raw[k] = [existing, v];
    }
  }

  // 如果字段声明为 array，保留数组；否则取第一个值
  for (const [key, field] of Object.entries(schema)) {
    const val = raw[key];
    if (val !== undefined && field.type !== "array" && Array.isArray(val)) {
      raw[key] = val[0];
    }
  }

  // file count check
  for (const [key, field] of Object.entries(schema)) {
    if (field.type === "file" && field.maxFiles !== undefined) {
      const val = raw[key];
      const files = Array.isArray(val) ? val : val !== undefined ? [val] : [];
      const fileCount = files.filter((f) => f instanceof File).length;
      if (fileCount > field.maxFiles) {
        return { data: {}, errors: [`${key}: too many files (${fileCount}, max: ${field.maxFiles})`] };
      }
    }
  }

  return coerceAndValidate(raw, schema);
}
