// Tool Registry - Tool 注册、发现与调用

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  requiresApproval?: boolean;
  riskLevel?: "low" | "medium" | "high" | "critical";
  timeout?: number;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  timestamp: number;
}

export interface ToolRegistry {
  register(tool: ToolDefinition): void;
  unregister(name: string): boolean;
  get(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  execute(name: string, params: Record<string, unknown>): Promise<ToolExecutionResult>;
  validateParams(name: string, params: Record<string, unknown>): { valid: boolean; errors: string[] };
  toJSONSchema(): Array<{
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }>;
}

const DEFAULT_TIMEOUT = 30_000;

const PARAM_TYPE_MAP: Record<ToolParameter["type"], string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  object: "object",
  array: "array",
};

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

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

  function register(tool: ToolDefinition): void {
    if (tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    tools.set(tool.name, tool);
  }

  function unregister(name: string): boolean {
    return tools.delete(name);
  }

  function get(name: string): ToolDefinition | undefined {
    return tools.get(name);
  }

  function list(): ToolDefinition[] {
    return Array.from(tools.values());
  }

  function validateParams(name: string, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const tool = tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool "${name}" not found`] };
    }

    const errors: string[] = [];

    for (const param of tool.parameters) {
      const value = params[param.name];

      if (param.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined && value !== null && !validateParamType(value, param.type)) {
        errors.push(`Parameter "${param.name}" expected type "${param.type}" but got "${typeof value}"`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async function execute(name: string, params: Record<string, unknown>): Promise<ToolExecutionResult> {
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

    const timeout = tool.timeout ?? DEFAULT_TIMEOUT;
    const start = performance.now();
    const timestamp = Date.now();

    try {
      const result = await Promise.race([
        tool.handler(params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${name}" execution timed out after ${timeout}ms`)), timeout),
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
      const properties: Record<string, unknown> = {};
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
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
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
