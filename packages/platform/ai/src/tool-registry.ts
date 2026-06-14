/**
 * @ventostack/ai — 工具注册、发现与调用
 *
 * 提供 AI 工具的注册、参数校验、超时执行和 JSON Schema 导出能力。
 * 所有工具必须显式注册，禁止任意执行未注册函数。
 */

import Ajv from "ajv";
import type { ErrorObject, ValidateFunction } from "ajv";

/** 工具参数定义 */
export interface ToolParameter {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: "string" | "number" | "boolean" | "object" | "array";
  /** 参数说明 */
  description: string;
  /** 是否必填 */
  required?: boolean;
  /** 额外 JSON Schema 约束 */
  schema?: Record<string, unknown>;
}

/** 工具定义 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具说明 */
  description: string;
  /** 参数列表 */
  parameters: ToolParameter[];
  /** 工具处理函数 */
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  /** 是否需要审批 */
  requiresApproval?: boolean;
  /** 风险等级 */
  riskLevel?: "low" | "medium" | "high" | "critical";
  /** 超时时间（毫秒） */
  timeout?: number;
}

/** 工具执行结果 */
export interface ToolExecutionResult {
  /** 工具名称 */
  toolName: string;
  /** 是否执行成功 */
  success: boolean;
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 执行时间戳（毫秒） */
  timestamp: number;
}

/** 工具注册表，负责工具的注册、发现、参数校验和执行 */
/** 工具简写别名 */
export type Tool = ToolDefinition;

export interface ToolRegistry {
  /**
   * 注册工具
   * @param tool - 工具定义
   */
  register(tool: ToolDefinition): void;

  /**
   * 注销工具
   * @param name - 工具名称
   * @returns 注销成功返回 true
   */
  unregister(name: string): boolean;

  /**
   * 获取工具定义
   * @param name - 工具名称
   * @returns 工具定义，不存在返回 undefined
   */
  get(name: string): ToolDefinition | undefined;

  /** 列出所有已注册的工具 */
  list(): ToolDefinition[];

  /**
   * 执行指定工具
   * @param name - 工具名称
   * @param params - 调用参数
   * @returns 工具执行结果
   */
  execute(name: string, params: Record<string, unknown>): Promise<ToolExecutionResult>;

  /**
   * 校验工具参数
   * @param name - 工具名称
   * @param params - 待校验参数
   * @returns 校验结果及错误信息列表
   */
  validateParams(
    name: string,
    params: Record<string, unknown>,
  ): { valid: boolean; errors: string[] };

  /**
   * 导出所有工具的 JSON Schema 描述
   * @returns JSON Schema 数组，用于 OpenAPI / Function Calling
   */
  toJSONSchema(): Array<{
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }>;
}

/**
 * 审批管理器接口
 * 用于在执行高风险工具前获取人工审批
 */
export interface ApprovalManager {
  /**
   * 请求审批
   * @param toolName 工具名称
   * @param params 工具参数
   * @returns 审批结果：approved 为 true 表示批准，否则拒绝，reason 为拒绝原因
   */
  requestApproval(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ approved: boolean; reason?: string }>;
}

/** 默认工具执行超时：30 秒（毫秒） */
const DEFAULT_TIMEOUT = 30_000;

/** 内部参数类型到 JSON Schema 类型的映射 */
const PARAM_TYPE_MAP: Record<ToolParameter["type"], string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  object: "object",
  array: "array",
};

interface ToolObjectSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
}

const ajv = new Ajv({ allErrors: true });

/**
 * 校验单个参数值是否符合期望类型
 * @param value - 参数值
 * @param expectedType - 期望类型
 * @returns 是否匹配
 */
function validateParamType(value: unknown, expectedType: ToolParameter["type"]): boolean {
  switch (expectedType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
  }
}

function buildToolObjectSchema(tool: ToolDefinition): ToolObjectSchema {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const param of tool.parameters) {
    const prop: Record<string, unknown> = {
      type: PARAM_TYPE_MAP[param.type],
      description: param.description,
    };
    if (param.schema) {
      Object.assign(prop, param.schema);
    }
    properties[param.name] = prop;

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: "object",
    properties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  };
}

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => {
    if (error.keyword === "required") {
      const missingProperty =
        typeof error.params === "object" &&
        error.params !== null &&
        "missingProperty" in error.params
          ? String((error.params as { missingProperty: unknown }).missingProperty)
          : "unknown";
      return `Missing required parameter: ${missingProperty}`;
    }

    if (error.keyword === "additionalProperties") {
      const additionalProperty =
        typeof error.params === "object" &&
        error.params !== null &&
        "additionalProperty" in error.params
          ? String((error.params as { additionalProperty: unknown }).additionalProperty)
          : "unknown";
      return `Unexpected parameter: ${additionalProperty}`;
    }

    const path = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
    const label = path.length > 0 ? `Parameter "${path}"` : "Parameters";
    return `${label} ${error.message ?? "are invalid"}`;
  });
}

/**
 * 创建工具注册表实例
 * @param options 可选配置
 * @param options.approvalManager 审批管理器实例，用于高风险工具的人工审批
 * @returns ToolRegistry 实例
 */
export function createToolRegistry(options?: { approvalManager?: ApprovalManager }): ToolRegistry {
  const approvalManager = options?.approvalManager;
  const tools = new Map<string, ToolDefinition>();
  const validators = new Map<string, ValidateFunction<Record<string, unknown>>>();

  function register(tool: ToolDefinition): void {
    if (tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }

    const validator = ajv.compile<Record<string, unknown>>(buildToolObjectSchema(tool));
    tools.set(tool.name, tool);
    validators.set(tool.name, validator);
  }

  function unregister(name: string): boolean {
    validators.delete(name);
    return tools.delete(name);
  }

  function get(name: string): ToolDefinition | undefined {
    return tools.get(name);
  }

  function list(): ToolDefinition[] {
    return Array.from(tools.values());
  }

  function validateParams(
    name: string,
    params: Record<string, unknown>,
  ): { valid: boolean; errors: string[] } {
    const tool = tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool "${name}" not found`] };
    }

    const validator = validators.get(name);
    if (!validator) {
      return { valid: false, errors: [`Tool "${name}" validator not found`] };
    }

    const errors: string[] = [];

    for (const param of tool.parameters) {
      const value = params[param.name];

      if (param.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined && value !== null && !validateParamType(value, param.type)) {
        errors.push(
          `Parameter "${param.name}" expected type "${param.type}" but got "${typeof value}"`,
        );
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const valid = validator(params);
    if (!valid) {
      return { valid: false, errors: formatValidationErrors(validator.errors) };
    }

    return { valid: true, errors: [] };
  }

  async function execute(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const tool = tools.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        error: `Tool "${name}" not found`,
        duration: 0,
        timestamp: Date.now(),
      };
    }

    const validation = validateParams(name, params);
    if (!validation.valid) {
      return {
        toolName: name,
        success: false,
        error: validation.errors.join("; "),
        duration: 0,
        timestamp: Date.now(),
      };
    }

    // 审批流检查：如果工具标记为需要审批，必须通过审批管理器获取许可
    // 这防止 AI 模型自主批准高风险操作（如删除数据、执行系统命令等）
    if (tool.requiresApproval) {
      if (!approvalManager) {
        return {
          toolName: name,
          success: false,
          error: `Tool "${name}" requires approval but no ApprovalManager is configured. ` +
            `Provide an ApprovalManager via createToolRegistry({ approvalManager }) to enable approval flow.`,
          duration: 0,
          timestamp: Date.now(),
        };
      }

      try {
        const approval = await approvalManager.requestApproval(name, params);
        if (!approval.approved) {
          return {
            toolName: name,
            success: false,
            error: `Tool "${name}" execution was not approved${approval.reason ? `: ${approval.reason}` : ""}`,
            duration: 0,
            timestamp: Date.now(),
          };
        }
      } catch (err) {
        return {
          toolName: name,
          success: false,
          error: `Approval request failed for tool "${name}": ${err instanceof Error ? err.message : String(err)}`,
          duration: 0,
          timestamp: Date.now(),
        };
      }
    }

    const timeout = tool.timeout ?? DEFAULT_TIMEOUT;
    const start = performance.now();
    const timestamp = Date.now();

    try {
      const result = await Promise.race([
        tool.handler(params),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tool "${name}" execution timed out after ${timeout}ms`)),
            timeout,
          ),
        ),
      ]);

      return {
        toolName: name,
        success: true,
        result,
        duration: performance.now() - start,
        timestamp,
      };
    } catch (err) {
      return {
        toolName: name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        duration: performance.now() - start,
        timestamp,
      };
    }
  }

  function toJSONSchema(): Array<{
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }> {
    return list().map((tool) => {
      const schema = buildToolObjectSchema(tool);

      return {
        name: tool.name,
        description: tool.description,
        parameters: schema,
      };
    });
  }

  return {
    register,
    unregister,
    get,
    list,
    execute,
    validateParams,
    toJSONSchema,
  };
}
