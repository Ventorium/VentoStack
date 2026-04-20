// @aeron/core - YAML 配置文件支持

/**
 * 简单的 YAML 解析器（支持基本的 key-value、嵌套对象、数组）
 * 不引入第三方 YAML 库，满足配置文件的基本需求
 */
export function parseYAML(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  const stack: { indent: number; obj: Record<string, unknown>; parentObj?: Record<string, unknown>; parentKey?: string }[] = [{ indent: -1, obj: result }];

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
 * 将对象序列化为 YAML 格式
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

/**
 * 从 YAML 文件加载配置
 */
export async function loadYAMLConfig(filePath: string): Promise<Record<string, unknown>> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  const text = await file.text();
  return parseYAML(text);
}
