// @aeron/core - 配置系统

export interface ConfigFieldDef {
  type: "string" | "number" | "boolean";
  default?: unknown;
  env?: string;
  required?: boolean;
  secret?: boolean;
}

export type ConfigSchema = Record<string, ConfigFieldDef | ConfigSchema>;

// 判断是否为字段定义（而非嵌套 schema）
function isFieldDef(value: unknown): value is ConfigFieldDef {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as ConfigFieldDef).type === "string" &&
    ["string", "number", "boolean"].includes((value as ConfigFieldDef).type)
  );
}

// 从类型字符串转换实际值
function coerceValue(
  raw: string,
  type: ConfigFieldDef["type"],
  key: string,
): string | number | boolean {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(
          `Config "${key}": cannot coerce "${raw}" to number`,
        );
      }
      return num;
    }
    case "boolean": {
      if (raw === "true" || raw === "1") return true;
      if (raw === "false" || raw === "0") return false;
      throw new Error(
        `Config "${key}": cannot coerce "${raw}" to boolean`,
      );
    }
  }
}

function resolveField(
  fieldDef: ConfigFieldDef,
  key: string,
  env: Record<string, string | undefined>,
): unknown {
  // 1. 从环境变量读取
  if (fieldDef.env) {
    const envValue = env[fieldDef.env];
    if (envValue !== undefined) {
      return coerceValue(envValue, fieldDef.type, key);
    }
  }

  // 2. 使用默认值
  if (fieldDef.default !== undefined) {
    return fieldDef.default;
  }

  // 3. 必填字段缺失
  if (fieldDef.required) {
    throw new Error(`Config "${key}" is required but not provided`);
  }

  return undefined;
}

function resolveSchema(
  schema: ConfigSchema,
  env: Record<string, string | undefined>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (isFieldDef(def)) {
      result[key] = resolveField(def, fullKey, env);
    } else {
      // 嵌套 schema
      result[key] = resolveSchema(def as ConfigSchema, env, fullKey);
    }
  }

  return result;
}

export type ConfigValue<T extends ConfigSchema = ConfigSchema> = {
  [K in keyof T]: T[K] extends ConfigFieldDef
    ? T[K]["type"] extends "string"
      ? string | undefined
      : T[K]["type"] extends "number"
        ? number | undefined
        : T[K]["type"] extends "boolean"
          ? boolean | undefined
          : unknown
    : T[K] extends ConfigSchema
      ? ConfigValue<T[K]>
      : unknown;
};

export function createConfig<T extends ConfigSchema>(
  schema: T,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ConfigValue<T> {
  return resolveSchema(schema, env) as ConfigValue<T>;
}
