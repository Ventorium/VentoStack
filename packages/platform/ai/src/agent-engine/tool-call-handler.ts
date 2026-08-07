/**
 * 工具调用解析 + JSON 修复
 */
import type { ToolCall } from "../llm-gateway/types";
import type { ToolRegistry } from "../tool-registry";
import type { AgentTool } from "./types";

export interface ParsedToolCall {
  name: string;
  params: Record<string, unknown>;
  id: string;
  error?: string;
}

function validateSchema(value: unknown, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = [];
  const expected = schema.type;
  const typeMatches =
    expected === undefined ||
    (expected === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) ||
    (expected === "array" && Array.isArray(value)) ||
    (expected === "string" && typeof value === "string") ||
    (expected === "number" && typeof value === "number" && Number.isFinite(value)) ||
    (expected === "integer" && typeof value === "number" && Number.isInteger(value)) ||
    (expected === "boolean" && typeof value === "boolean") ||
    (expected === "null" && value === null);
  if (!typeMatches) return [`${path} must be ${String(expected)}`];

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must be one of the allowed values`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path} must contain at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path} must match the configured pattern`);
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path} must be at most ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path} must contain at most ${schema.maxItems} items`);
    }
    if (typeof schema.items === "object" && schema.items !== null) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(item, schema.items as Record<string, unknown>, `${path}[${index}]`));
      });
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const properties =
      typeof schema.properties === "object" && schema.properties !== null
        ? schema.properties as Record<string, Record<string, unknown>>
        : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((name): name is string => typeof name === "string")
      : [];
    for (const name of required) {
      if (!(name in record)) errors.push(`${path}.${name} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(record)) {
        if (!(name in properties)) errors.push(`${path}.${name} is not allowed`);
      }
    }
    for (const [name, propertySchema] of Object.entries(properties)) {
      if (name in record) errors.push(...validateSchema(record[name], propertySchema, `${path}.${name}`));
    }
  }
  return errors;
}

/** Validate a call against the schema carried by an AgentTool. */
export function validateAgentToolArguments(
  tool: AgentTool,
  args: unknown,
): { valid: boolean; errors: string[] } {
  const errors = validateSchema(args, tool.parameters, "parameters");
  return { valid: errors.length === 0, errors };
}

/**
 * 解析工具调用列表，校验工具存在性和参数
 */
export function parseToolCalls(
  toolCalls: ToolCall[],
  registry: ToolRegistry,
): ParsedToolCall[] {
  const results: ParsedToolCall[] = [];

  for (const tc of toolCalls) {
    // 校验工具是否存在
    const tool = registry.get(tc.name);
    if (!tool) {
      results.push({ name: tc.name, params: {}, id: tc.id, error: `工具 ${tc.name} 不存在` });
      continue;
    }

    // 解析参数（LLM 返回的可能是字符串或对象）
    let params: Record<string, unknown>;
    if (typeof tc.arguments === "string") {
      try {
        params = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch {
        params = attemptJSONRepair(tc.arguments);
      }
    } else {
      params = tc.arguments;
    }

    // 校验参数
    const validation = registry.validateParams(tc.name, params);
    if (!validation.valid) {
      results.push({
        name: tc.name,
        params,
        id: tc.id,
        error: validation.errors.join("; "),
      });
      continue;
    }

    results.push({ name: tc.name, params, id: tc.id });
  }

  return results;
}

/**
 * 修复 LLM 常见的 JSON 错误
 */
export function attemptJSONRepair(raw: string): Record<string, unknown> {
  let cleaned = raw;

  // 去除 markdown 代码块标记
  cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  // 修复尾部逗号
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

  // 修复单引号 → 双引号（简单场景）
  if (!cleaned.includes('"')) {
    cleaned = cleaned.replace(/'/g, '"');
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return {};
  }
}
