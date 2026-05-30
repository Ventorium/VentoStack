// @ventostack/core - 配置系统

import { inspect } from "node:util";

/** 配置字段公共属性（与具体类型无关） */
interface ConfigFieldDefBase {
  /** 对应环境变量名 */
  env?: string;
  /** 是否必填 */
  required?: boolean;
  /** 是否为密钥（需加密存储） */
  secret?: boolean;
  /** 是否为敏感信息（日志脱敏） */
  sensitive?: boolean;
}

/** 配置字段定义 —— string 变体（default/options 类型与 type 严格关联） */
export interface StringConfigFieldDef extends ConfigFieldDefBase {
  type: "string";
  /** 默认值 */
  default?: string;
  /** 可选枚举值 */
  options?: readonly string[];
}

/** 配置字段定义 —— number 变体（default/options 类型与 type 严格关联） */
export interface NumberConfigFieldDef extends ConfigFieldDefBase {
  type: "number";
  /** 默认值 */
  default?: number;
  /** 可选枚举值 */
  options?: readonly number[];
}

/** 配置字段定义 —— boolean 变体（default/options 类型与 type 严格关联） */
export interface BooleanConfigFieldDef extends ConfigFieldDefBase {
  type: "boolean";
  /** 默认值 */
  default?: boolean;
  /** 可选枚举值 */
  options?: readonly boolean[];
}

/** 配置字段定义（discriminated union，default/options 类型与 type 关联） */
export type ConfigFieldDef = StringConfigFieldDef | NumberConfigFieldDef | BooleanConfigFieldDef;

/** 配置结构定义（支持嵌套） */
export interface ConfigSchema {
  [key: string]: ConfigFieldDef | ConfigSchema;
}

/** 配置加载器选项 */
export interface ConfigLoaderOptions {
  /** 配置文件基础路径 */
  basePath?: string;
  /** 当前环境名 */
  env?: string;
}

/** 安全预检选项 */
export interface SecurityCheckOptions {
  /** 需要强制存在的密钥环境变量名列表，例如 JWT_SECRET、DB_PASSWORD */
  requiredSecrets?: string[];
  /** 密钥最小长度阈值，只在 requiredSecrets 命中时检查，默认 32 */
  minSecretLength?: number;
  /** 是否在生产环境要求协议必须是 https；读取 PROTOCOL 或 APP_PROTOCOL */
  requireHTTPS?: boolean;
  /** 是否在生产环境禁止开启 DEBUG；DEBUG=1 或 DEBUG=true 都算开启 */
  disallowDebug?: boolean;
}

/** 安全预检结果 */
export interface SecurityCheckResult {
  /** 是否通过 */
  passed: boolean;
  /** 错误信息列表 */
  errors: string[];
}

const CONFIG_INSPECT = inspect.custom;
const CONFIG_SCHEMA = Symbol("ventostack.config.schema");

type ConfigWithSchema = {
  [CONFIG_SCHEMA]?: ConfigSchema;
};

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

function attachConfigSchema<T extends ConfigSchema>(
  config: ConfigValue<T>,
  schema: T,
): ConfigValue<T> {
  Object.defineProperty(config, CONFIG_SCHEMA, {
    value: schema,
    enumerable: false,
    configurable: true,
  });

  return config;
}

function getConfigSchema(config: unknown): ConfigSchema | undefined {
  if (typeof config !== "object" || config === null) {
    return undefined;
  }

  return (config as ConfigWithSchema)[CONFIG_SCHEMA];
}

/**
 * 从类型字符串转换实际值
 * @param raw - 原始字符串
 * @param type - 目标类型
 * @param key - 配置键名（用于报错）
 * @returns 转换后的值
 */
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
        throw new Error(`Config "${key}": cannot coerce "${raw}" to number`);
      }
      return num;
    }
    case "boolean": {
      if (raw === "true" || raw === "1") return true;
      if (raw === "false" || raw === "0") return false;
      throw new Error(`Config "${key}": cannot coerce "${raw}" to boolean`);
    }
  }
}

/**
 * 解析单个字段值（按优先级：环境变量 > 覆盖值 > 默认值）
 * @param fieldDef - 字段定义
 * @param key - 完整键名
 * @param env - 环境变量对象
 * @param overrides - 覆盖值对象
 * @returns 解析后的值
 */
function resolveField(
  fieldDef: ConfigFieldDef,
  key: string,
  env: Record<string, string | undefined>,
  overrides?: Record<string, unknown>,
): unknown {
  let value: unknown;

  // 1. 从环境变量读取（最高优先级）
  if (fieldDef.env) {
    const envValue = env[fieldDef.env];
    if (envValue !== undefined) {
      value = coerceValue(envValue, fieldDef.type, key);
    }
  }

  // 2. 从 overrides（文件合并后的值）读取
  if (value === undefined && overrides !== undefined) {
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
        value = coerceValue(current, fieldDef.type, key);
      } else {
        value = current;
      }
    }
  }

  // 3. 使用默认值
  if (value === undefined && fieldDef.default !== undefined) {
    value = fieldDef.default;
  }

  // 4. 必填字段缺失
  if (value === undefined && fieldDef.required) {
    throw new Error(`Config "${key}" is required but not provided`);
  }

  // 5. 校验 options
  if (fieldDef.options && value !== undefined && !fieldDef.options.includes(value as never)) {
    throw new Error(
      `Config "${key}": value "${value}" is not in allowed options [${fieldDef.options.join(", ")}]`,
    );
  }

  return value;
}

/**
 * 递归解析配置结构
 * @param schema - 配置结构
 * @param env - 环境变量
 * @param prefix - 键名前缀
 * @param overrides - 覆盖值
 * @returns 解析后的配置对象
 */
export function resolveConfigSchema(
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
      result[key] = resolveConfigSchema(def as ConfigSchema, env, fullKey, overrides);
    }
  }

  return result;
}

type ExtractFieldType<T> = T extends { options: readonly (infer O)[] }
  ? O
  : T extends StringConfigFieldDef
    ? string
    : T extends NumberConfigFieldDef
      ? number
      : T extends BooleanConfigFieldDef
        ? boolean
        : unknown;

type IsNonNullableField<T> = T extends { required: true }
  ? true
  : T extends { default: infer D }
    ? [D] extends [undefined]
      ? false
      : true
    : false;

/** 从 ConfigSchema 推导出的配置值类型
 *  - 有 default 或 required: true 的字段不含 undefined
 *  - 其余字段为 T | undefined
 */
export type ConfigValue<T extends ConfigSchema = ConfigSchema> = {
  [K in keyof T]: T[K] extends ConfigFieldDef
    ? IsNonNullableField<T[K]> extends true
      ? ExtractFieldType<T[K]>
      : ExtractFieldType<T[K]> | undefined
    : T[K] extends ConfigSchema
      ? ConfigValue<T[K]>
      : unknown;
};

/**
 * 根据 schema 创建配置对象（仅从环境变量解析）
 * @param schema - 配置结构
 * @param env - 环境变量，默认 process.env
 * @returns 类型安全的配置对象
 */
export function createConfig<const T extends ConfigSchema>(
  schema: T,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ConfigValue<T> {
  return attachConfigInspection(schema, resolveConfigSchema(schema, env) as ConfigValue<T>);
}

// --- 深度合并 ---

/**
 * 深度合并两个对象
 * @param target - 目标对象
 * @param source - 源对象
 * @returns 合并后的新对象
 */
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

/**
 * 加载 JSON 配置文件
 * @param filePath - 文件路径
 * @returns JSON 对象，文件不存在返回 null
 */
async function loadJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  return file.json() as Promise<Record<string, unknown>>;
}

// --- CLI 参数解析 ---

/**
 * 解析命令行参数
 * @param args - 参数数组，默认 Bun.argv.slice(2)
 * @returns 解析后的键值对象
 */
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

/**
 * 加载分环境配置（base.json + {env}.json）
 * @param schema - 配置结构
 * @param options - 加载选项
 * @param env - 环境变量
 * @returns 类型安全的配置对象
 */
export async function loadConfig<const T extends ConfigSchema>(
  schema: T,
  options?: ConfigLoaderOptions,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<ConfigValue<T>> {
  const basePath = options?.basePath ?? "config";
  const envName = options?.env ?? env.NODE_ENV ?? "development";

  // 1. 加载 base.json
  const baseConfig = (await loadJsonFile(`${basePath}/base.json`)) ?? {};

  // 2. 加载 {env}.json
  const envConfig = (await loadJsonFile(`${basePath}/${envName}.json`)) ?? {};

  // 3. 深度合并: env 覆盖 base
  const merged = deepMerge(baseConfig, envConfig);

  // 4. 通过 schema 解析，环境变量覆盖文件配置
  return attachConfigInspection(
    schema,
    resolveConfigSchema(schema, env, "", merged) as ConfigValue<T>,
  );
}

// --- 安全预检 ---

/**
 * 执行安全预检。
 *
 * 检查规则：
 * - `requiredSecrets`：逐个检查环境变量是否存在且非空
 * - `minSecretLength`：仅对 `requiredSecrets` 中命中的值检查长度，默认 32
 * - `requireHTTPS`：仅在 `NODE_ENV=production` 时检查 `PROTOCOL` / `APP_PROTOCOL` 是否为 `https`
 * - `disallowDebug`：仅在 `NODE_ENV=production` 时检查 `DEBUG` 是否显式开启
 *
 * @param options - 预检选项
 * @param env - 环境变量
 * @returns 预检结果
 */
export function securityPrecheck(
  options: SecurityCheckOptions,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): SecurityCheckResult {
  const errors: string[] = [];
  const minLen = options.minSecretLength ?? 32;
  const isProduction = env.NODE_ENV === "production";

  // 检查必需的 secret
  if (options.requiredSecrets) {
    for (const name of options.requiredSecrets) {
      const value = env[name];
      if (value === undefined || value === "") {
        errors.push(`Missing required secret: ${name}`);
      } else if (value.length < minLen) {
        errors.push(`Secret ${name} is too short (${value.length} < ${minLen})`);
      }
    }
  }

  // 生产环境检查 HTTPS
  if (options.requireHTTPS && isProduction) {
    const protocol = env.PROTOCOL ?? env.APP_PROTOCOL ?? "";
    if (protocol !== "https") {
      errors.push("HTTPS is required in production");
    }
  }

  // 生产环境禁止 DEBUG
  if (options.disallowDebug && isProduction) {
    const debug = env.DEBUG;
    if (debug === "true" || debug === "1") {
      errors.push("DEBUG must not be enabled in production");
    }
  }

  return { passed: errors.length === 0, errors };
}

/**
 * 给配置对象挂载安全的 inspect 行为。
 *
 * - `console.log(config)` / `util.inspect(config)` 会看到脱敏后的结果
 * - 直接访问 `config.jwtSecret` 仍然返回真实值，供业务逻辑使用
 * - 如果需要日志安全输出，优先打印整个配置对象，而不是单独拼接敏感字段
 */
export function attachConfigInspection<const T extends ConfigSchema>(
  schema: T,
  config: ConfigValue<T>,
): ConfigValue<T> {
  attachConfigSchema(config, schema);

  const masked = () => sanitizeConfig(schema, config as Record<string, unknown>);

  Object.defineProperty(config, CONFIG_INSPECT, {
    value: masked,
    enumerable: false,
    configurable: true,
  });

  return config;
}

/**
 * 生成配置对象的安全只读快照。
 *
 * - 敏感字段会变成 `***`
 * - 非敏感字段保留原值
 * - 返回的是新对象，不会影响原始配置
 */
export function safeConfig<const T extends ConfigSchema>(config: ConfigValue<T>): ConfigValue<T> {
  const schema = getConfigSchema(config);

  if (!schema) {
    throw new Error(
      "safeConfig() expects a Ventostack config object created by createConfig/loadConfig/loadYAMLConfig",
    );
  }

  return sanitizeConfig(schema, config as Record<string, unknown>) as ConfigValue<T>;
}

// --- 敏感字段脱敏 ---

/**
 * 对配置对象中的敏感字段进行脱敏
 * @param schema - 配置结构
 * @param config - 配置值对象
 * @param mask - 脱敏掩码，默认 "***"
 * @returns 脱敏后的配置对象
 */
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
      result[key] = sanitizeConfig(def as ConfigSchema, value as Record<string, unknown>, mask);
    } else {
      result[key] = value;
    }
  }

  return result;
}
