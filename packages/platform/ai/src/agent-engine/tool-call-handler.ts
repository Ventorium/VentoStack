/**
 * 工具调用解析 + JSON 修复
 */
import type { ToolCall } from "../llm-gateway/types";
import type { ToolRegistry } from "../tool-registry";

export interface ParsedToolCall {
  name: string;
  params: Record<string, unknown>;
  id: string;
  error?: string;
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
