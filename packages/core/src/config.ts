// @aeron/core - 配置系统

export interface ConfigFieldDef {
  type: "string" | "number" | "boolean";
  default?: unknown;
  env?: string;
  required?: boolean;
  secret?: boolean;
  sensitive?: boolean;
}

export type ConfigSchema = Record<string, ConfigFieldDef | ConfigSchema>;

export interface ConfigLoaderOptions {
  basePath?: string;
  env?: string;
}

export interface SecurityCheckOptions {
  requiredSecrets?: string[];
  minSecretLength?: number;
  requireHTTPS?: boolean;
  disallowDebug?: boolean;
}

export interface SecurityCheckResult {
  passed: boolean;
  errors: string[];
}

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
  overrides?: Record<string, unknown>,
): unknown {
  // 1. 从环境变量读取（最高优先级）
  if (fieldDef.env) {
    const envValue = env[fieldDef.env];
    if (envValue !== undefined) {
      return coerceValue(envValue, fieldDef.type, key);
    }
  }

  // 2. 从 overrides（文件合并后的值）读取
  if (overrides !== undefined) {
    const parts = key.split(".");
    let current: unknown = overrides;
    for (const part of parts) {
      if (typeof current === "object" && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }
    if (current !== undefined) {
      if (typeof current === "string") {
        return coerceValue(current, fieldDef.type, key);
      }
      return current;
    }
  }

  // 3. 使用默认值
  if (fieldDef.default !== undefined) {
    return fieldDef.default;
  }

  // 4. 必填字段缺失
  if (fieldDef.required) {
    throw new Error(`Config "${key}" is required but not provided`);
  }

  return undefined;
}

function resolveSchema(
  schema: ConfigSchema,
  env: Record<string, string | undefined>,
  prefix = "",
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (isFieldDef(def)) {
      result[key] = resolveField(def, fullKey, env, overrides);
    } else {
      // 嵌套 schema
      result[key] = resolveSchema(def as ConfigSchema, env, fullKey, overrides);
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

// --- 深度合并 ---

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];
    if (
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal) &&
      typeof sourceVal === "object" &&
      sourceVal !== null &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

// --- JSON 配置文件加载 ---

async function loadJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  return file.json() as Promise<Record<string, unknown>>;
}

// --- CLI 参数解析 ---

export function parseArgs(args?: string[]): Record<string, unknown> {
  const argv = args ?? Bun.argv.slice(2);
  const result: Record<string, unknown> = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const withoutDashes = arg.slice(2);
    const eqIndex = withoutDashes.indexOf("=");

    let key: string;
    let value: string;

    if (eqIndex === -1) {
      key = withoutDashes;
      value = "true";
    } else {
      key = withoutDashes.slice(0, eqIndex);
      value = withoutDashes.slice(eqIndex + 1);
    }

    if (key.length === 0) continue;

    // 支持点号分隔的嵌套路径
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]!] = value;
  }

  return result;
}

// --- 分环境配置加载 ---

export async function loadConfig<T extends ConfigSchema>(
  schema: T,
  options?: ConfigLoaderOptions,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<ConfigValue<T>> {
  const basePath = options?.basePath ?? "config";
  const envName = options?.env ?? env["NODE_ENV"] ?? "development";

  // 1. 加载 base.json
  const baseConfig = (await loadJsonFile(`${basePath}/base.json`)) ?? {};

  // 2. 加载 {env}.json
  const envConfig = (await loadJsonFile(`${basePath}/${envName}.json`)) ?? {};

  // 3. 深度合并: env 覆盖 base
  const merged = deepMerge(baseConfig, envConfig);

  // 4. 通过 schema 解析，环境变量覆盖文件配置
  return resolveSchema(schema, env, "", merged) as ConfigValue<T>;
}

// --- 安全预检 ---

export function securityPrecheck(
  options: SecurityCheckOptions,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): SecurityCheckResult {
  const errors: string[] = [];
  const minLen = options.minSecretLength ?? 32;
  const isProduction = env["NODE_ENV"] === "production";

  // 检查必需的 secret
  if (options.requiredSecrets) {
    for (const name of options.requiredSecrets) {
      const value = env[name];
      if (value === undefined || value === "") {
        errors.push(`Missing required secret: ${name}`);
      } else if (value.length < minLen) {
        errors.push(
          `Secret ${name} is too short (${value.length} < ${minLen})`,
        );
      }
    }
  }

  // 生产环境检查 HTTPS
  if (options.requireHTTPS && isProduction) {
    const protocol = env["PROTOCOL"] ?? env["APP_PROTOCOL"] ?? "";
    if (protocol !== "https") {
      errors.push("HTTPS is required in production");
    }
  }

  // 生产环境禁止 DEBUG
  if (options.disallowDebug && isProduction) {
    const debug = env["DEBUG"];
    if (debug === "true" || debug === "1") {
      errors.push("DEBUG must not be enabled in production");
    }
  }

  return { passed: errors.length === 0, errors };
}

// --- 敏感字段脱敏 ---

export function sanitizeConfig(
  schema: ConfigSchema,
  config: Record<string, unknown>,
  mask = "***",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(schema)) {
    const value = config[key];

    if (isFieldDef(def)) {
      if (def.sensitive && value !== undefined) {
        result[key] = mask;
      } else {
        result[key] = value;
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeConfig(
        def as ConfigSchema,
        value as Record<string, unknown>,
        mask,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
