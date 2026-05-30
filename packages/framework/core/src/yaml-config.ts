// @ventostack/core - YAML 配置文件支持

import {
  type ConfigSchema,
  type ConfigValue,
  attachConfigInspection,
  resolveConfigSchema,
} from "./config";

/**
 * 解析 YAML 字符串为 JavaScript 对象。
 * 这是一个轻量级实现，不引入第三方 YAML 库，支持基本的 key-value、嵌套对象与数组，满足配置文件的基本需求。
 * @param text - 原始 YAML 文本内容
 * @returns 解析后的对象，键为字符串，值为未知类型
 */
export function parseYAML(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  const stack: {
    /** 当前层级的缩进字符数 */
    indent: number;
    /** 当前层级的目标对象 */
    obj: Record<string, unknown>;
    /** 父级对象（用于数组回溯） */
    parentObj?: Record<string, unknown>;
    /** 父级键名（用于数组回溯） */
    parentKey?: string;
  }[] = [{ indent: -1, obj: result }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // 跳过空行和注释
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // 数组项 "- value"
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      // 找到当前上下文
      while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
        stack.pop();
      }
      const frame = stack[stack.length - 1]!;
      const targetObj = frame.parentObj ?? frame.obj;
      const targetKey = frame.parentKey ?? Object.keys(frame.obj).pop();
      if (targetKey && targetObj) {
        if (!Array.isArray(targetObj[targetKey])) {
          targetObj[targetKey] = [];
        }
        (targetObj[targetKey] as unknown[]).push(parseValue(value));
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // 调整栈深度
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1]!.obj;

    if (rawValue === "" || rawValue === "|" || rawValue === ">") {
      // 嵌套对象或数组（先假设对象，数组在遇到 - 时会覆盖）
      const nested: Record<string, unknown> = {};
      current[key] = nested;
      stack.push({ indent, obj: nested, parentObj: current, parentKey: key });
    } else {
      current[key] = parseValue(rawValue);
    }
  }

  return result;
}

/**
 * 将 YAML 中的环境变量占位符替换为实际值。
 * 占位符格式：`{SERVER_HOST}`，支持字符串中嵌入多个占位符。
 */
function resolveEnvPlaceholders(
  value: unknown,
  env: Record<string, string | undefined>,
  path = "",
): unknown {
  if (typeof value === "string") {
    return value.replace(/\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
      const envValue = env[name];
      if (envValue === undefined) {
        const location = path ? ` at "${path}"` : "";
        throw new Error(`Missing environment variable "${name}"${location}`);
      }
      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => resolveEnvPlaceholders(item, env, `${path}[${index}]`));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      result[key] = resolveEnvPlaceholders(nested, env, nextPath);
    }
    return result;
  }

  return value;
}

/**
 * 将原始字符串解析为对应的 JavaScript 值。
 * 支持布尔值、null、带引号字符串与数字的自动推断。
 * @param raw - 原始字符串值
 * @returns 推断后的 JavaScript 值
 */
function parseValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;

  // 带引号的字符串
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  // 数字
  const num = Number(raw);
  if (!Number.isNaN(num) && raw !== "") return num;

  return raw;
}

/**
 * 将 JavaScript 对象序列化为 YAML 格式字符串。
 * 支持嵌套对象、数组、null 与需要转义的字符串值。
 * @param obj - 待序列化的对象
 * @param indent - 当前缩进层级，默认为 0（内部递归使用）
 * @returns 序列化后的 YAML 文本
 */
export function stringifyYAML(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(stringifyYAML(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          lines.push(`${prefix}  - ${JSON.stringify(item)}`);
        } else {
          lines.push(`${prefix}  - ${item}`);
        }
      }
    } else if (typeof value === "string" && (value.includes(":") || value.includes("#"))) {
      lines.push(`${prefix}${key}: "${value}"`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

export async function loadYAMLConfig(filePath: string): Promise<Record<string, unknown>>;
export async function loadYAMLConfig(
  filePath: string,
  schema: undefined,
  env?: Record<string, string | undefined>,
): Promise<Record<string, unknown>>;
export async function loadYAMLConfig<const T extends ConfigSchema>(
  filePath: string,
  schema: T,
  env?: Record<string, string | undefined>,
): Promise<ConfigValue<T>>;
export async function loadYAMLConfig<const T extends ConfigSchema>(
  filePath: string,
  schema?: T,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<Record<string, unknown> | ConfigValue<T>> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const text = await file.text();
  const parsed = parseYAML(text);
  const mergedEnv = {
    ...(process.env as Record<string, string | undefined>),
    ...env,
  };
  const resolved = resolveEnvPlaceholders(parsed, mergedEnv);

  if (!schema) {
    return resolved as Record<string, unknown>;
  }

  return attachConfigInspection(
    schema,
    resolveConfigSchema(
      schema,
      mergedEnv,
      "",
      resolved as Record<string, unknown>,
    ) as ConfigValue<T>,
  );
}
