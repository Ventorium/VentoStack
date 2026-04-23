// ============================================================
// @ventostack/openapi — Route Metadata (decorators.ts)
// 函数式路由元数据定义与 OpenAPI 转换
// ============================================================

import { isRouteResponseConfig, isSchemaField } from "@ventostack/core";
import type { RouteHandler, RouteResponseDefinition, Router, SchemaField, RouteSchemaConfig } from "@ventostack/core";
import type {
  OpenAPIGenerator,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
} from "./generator";
import type { OpenAPISchema } from "./schema-builder";

type InferredHelperKind = "json" | "text" | "html" | "redirect" | "stream";

interface InferredHelperCall {
  kind: InferredHelperKind;
  args: string[];
}

/** 路由元数据，用于描述单条路由的 OpenAPI 文档信息 */
export interface RouteMetadata {
  /** 路由路径 */
  path: string;
  /** HTTP 方法 */
  method: string;
  /** 接口摘要 */
  summary?: string;
  /** 接口详细描述 */
  description?: string;
  /** 标签分类 */
  tags?: string[];
  /** 操作唯一标识 */
  operationId?: string;
  /** 路径/查询/头参数定义 */
  parameters?: OpenAPIParameter[];
  /** 请求体定义 */
  requestBody?: OpenAPIRequestBody;
  /** 响应定义 */
  responses?: Record<string, OpenAPIResponse>;
  /** 安全要求 */
  security?: Array<Record<string, string[]>>;
  /** 是否已废弃 */
  deprecated?: boolean;
}

export interface SyncRouterToOpenAPIOptions {
  /** 生成文档时排除的路由路径 */
  excludePaths?: readonly string[];
}

/**
 * 定义单条路由的 OpenAPI 元数据
 * @param metadata - 路由元数据对象
 * @returns 原样返回的元数据对象，便于链式使用
 */
export function defineRouteDoc(metadata: RouteMetadata): RouteMetadata {
  return metadata;
}

/**
 * 将一组路由元数据批量注入到 OpenAPIGenerator 中
 * @param routes - 路由元数据数组
 * @param generator - OpenAPI 生成器实例
 */
export function routesToOpenAPI(routes: RouteMetadata[], generator: OpenAPIGenerator): void {
  for (const route of routes) {
    const operation: OpenAPIOperation = {
      responses: route.responses ?? {
        "200": { description: "Success" },
      },
    };

    if (route.summary !== undefined) operation.summary = route.summary;
    if (route.description !== undefined) operation.description = route.description;
    if (route.tags !== undefined) operation.tags = route.tags;
    if (route.operationId !== undefined) operation.operationId = route.operationId;
    if (route.parameters !== undefined) operation.parameters = route.parameters;
    if (route.requestBody !== undefined) operation.requestBody = route.requestBody;
    if (route.security !== undefined) operation.security = route.security;
    if (route.deprecated !== undefined) operation.deprecated = route.deprecated;

    generator.addPath(route.path, route.method, operation);
  }
}

// ---- Schema 转换辅助函数 ----

/**
 * 将核心 SchemaField 转换为 OpenAPISchema
 * @param field - 核心路由 Schema 字段定义
 * @returns OpenAPI 3.0 Schema 对象
 */
function schemaFieldToOpenAPISchema(field: SchemaField): OpenAPISchema {
  const schema: OpenAPISchema = {};

  switch (field.type) {
    case "string":
    case "uuid":
      schema.type = "string";
      if (field.type === "uuid") schema.format = "uuid";
      break;
    case "number":
    case "float":
      schema.type = "number";
      break;
    case "int":
      schema.type = "integer";
      break;
    case "boolean":
    case "bool":
      schema.type = "boolean";
      break;
    case "date":
      schema.type = "string";
      schema.format = "date-time";
      break;
    case "array":
      schema.type = "array";
      if (field.items) {
        schema.items = schemaFieldToOpenAPISchema(field.items);
      }
      break;
    case "object":
      schema.type = "object";
      if (field.properties) {
        schema.properties = {};
        for (const [key, prop] of Object.entries(field.properties)) {
          schema.properties[key] = schemaFieldToOpenAPISchema(prop);
        }
      }
      break;
    case "file":
      schema.type = "string";
      schema.format = "binary";
      break;
  }

  if (field.description !== undefined) schema.description = field.description;
  if (field.example !== undefined) schema.example = field.example;
  if (field.format !== undefined && schema.format === undefined) schema.format = field.format;
  if (field.enum !== undefined) schema.enum = [...field.enum];
  if (field.pattern !== undefined) schema.pattern = field.pattern.source;

  if (field.min !== undefined) {
    if (field.type === "string" || field.type === "uuid") {
      schema.minLength = field.min;
    } else if (field.type === "array") {
      // OpenAPISchema 当前未定义 minItems，跳过
    } else {
      schema.minimum = field.min;
    }
  }
  if (field.max !== undefined) {
    if (field.type === "string" || field.type === "uuid") {
      schema.maxLength = field.max;
    } else if (field.type === "array") {
      // OpenAPISchema 当前未定义 maxItems，跳过
    } else {
      schema.maximum = field.max;
    }
  }

  return schema;
}

/**
 * 从路由 SchemaConfig 的 responses 字段构建 OpenAPI 响应映射
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 响应映射，若未定义则返回 undefined
 */
function buildResponsesFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): Record<string, OpenAPIResponse> | undefined {
  if (!schemaConfig?.responses) return undefined;

  const responses: Record<string, OpenAPIResponse> = {};

  for (const [statusCode, responseDef] of Object.entries(schemaConfig.responses as Record<string, RouteResponseDefinition>)) {
    const isConfiguredResponse = isRouteResponseConfig(responseDef);
    const contentType = isConfiguredResponse ? responseDef.contentType : "application/json";
    const description = isConfiguredResponse ? responseDef.description : undefined;
    const schemaDef = isConfiguredResponse ? responseDef.schema : responseDef;
    let responseSchema: OpenAPISchema;

    if (isSchemaField(schemaDef)) {
      responseSchema = schemaFieldToOpenAPISchema(schemaDef);
    } else if (schemaDef && typeof schemaDef === "object" && !Array.isArray(schemaDef)) {
      const properties: Record<string, OpenAPISchema> = {};
      const requiredFields: string[] = [];
      for (const [name, field] of Object.entries(schemaDef as Record<string, SchemaField>)) {
        properties[name] = schemaFieldToOpenAPISchema(field);
        if (field.required) requiredFields.push(name);
      }
      responseSchema = {
        type: "object",
        properties,
        ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
      };
    } else {
      responseSchema = { type: "object" };
    }

    responses[statusCode] = {
      description: description ?? getStatusDescription(statusCode),
      content: {
        [contentType]: { schema: responseSchema },
      },
    };
  }

  return responses;
}

/**
 * 从路由 SchemaConfig 的 query 字段构建 OpenAPI 参数列表
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 参数列表
 */
function buildParametersFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): OpenAPIParameter[] {
  if (!schemaConfig?.query) return [];

  const parameters: OpenAPIParameter[] = [];
  for (const [name, field] of Object.entries(schemaConfig.query)) {
    parameters.push({
      name,
      in: "query",
      required: field.required === true,
      schema: schemaFieldToOpenAPISchema(field),
      ...(field.description !== undefined ? { description: field.description } : {}),
    });
  }
  return parameters;
}

/**
 * 从路由 SchemaConfig 的 body 字段构建 OpenAPI 请求体
 * @param schemaConfig - 路由 Schema 配置
 * @returns OpenAPI 请求体定义，若未定义则返回 undefined
 */
function buildRequestBodyFromSchemaConfig(
  schemaConfig: RouteSchemaConfig | undefined,
): OpenAPIRequestBody | undefined {
  if (!schemaConfig?.body && !schemaConfig?.formData) return undefined;

  const contentType = schemaConfig?.body ? "application/json" : "multipart/form-data";
  const schema = schemaConfig?.body ?? schemaConfig?.formData;

  if (!schema) return undefined;

  const properties: Record<string, OpenAPISchema> = {};
  const requiredFields: string[] = [];
  for (const [name, field] of Object.entries(schema)) {
    properties[name] = schemaFieldToOpenAPISchema(field);
    if (field.required) requiredFields.push(name);
  }

  return {
    required: requiredFields.length > 0,
    content: {
      [contentType]: {
        schema: {
          type: "object",
          properties,
          ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
        },
      },
    },
  };
}

/**
 * 获取常见 HTTP 状态码的默认描述
 * @param statusCode - 状态码字符串
 * @returns 描述文本
 */
function getStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    "200": "OK",
    "201": "Created",
    "202": "Accepted",
    "204": "No Content",
    "301": "Moved Permanently",
    "302": "Found",
    "307": "Temporary Redirect",
    "308": "Permanent Redirect",
    "400": "Bad Request",
    "401": "Unauthorized",
    "403": "Forbidden",
    "404": "Not Found",
    "409": "Conflict",
    "422": "Unprocessable Entity",
    "500": "Internal Server Error",
  };
  return descriptions[statusCode] ?? "Response";
}

function readCallArguments(source: string, openParenIndex: number): string | undefined {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (inTemplate) {
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenIndex + 1, index);
      }
    }
  }

  return undefined;
}

function splitTopLevelArguments(argsSource: string): string[] {
  const args: string[] = [];
  let current = "";
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let escaped = false;

  for (const char of argsSource) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (inTemplate) {
      current += char;
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "'") {
      current += char;
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      current += char;
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      current += char;
      inTemplate = true;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      current += char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      current += char;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      current += char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === "]") {
      bracketDepth -= 1;
      current += char;
      continue;
    }

    if (char === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const arg = current.trim();
      if (arg.length > 0) {
        args.push(arg);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const lastArg = current.trim();
  if (lastArg.length > 0) {
    args.push(lastArg);
  }

  return args;
}

function extractQuotedString(valueSource: string | undefined): string | undefined {
  if (!valueSource) return undefined;
  const trimmed = valueSource.trim();
  if (trimmed.length < 2) return undefined;

  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'" && quote !== "`") || trimmed.at(-1) !== quote) {
    return undefined;
  }

  return trimmed.slice(1, -1);
}

function parseNumericLiteral(valueSource: string | undefined): number | undefined {
  if (!valueSource) return undefined;
  const trimmed = valueSource.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

function inferLiteralSchema(valueSource: string | undefined): OpenAPISchema | undefined {
  if (!valueSource) return undefined;
  const trimmed = valueSource.trim();

  if (trimmed === "null") {
    return { nullable: true };
  }

  if (trimmed.startsWith("{")) {
    return { type: "object" };
  }

  if (trimmed.startsWith("[")) {
    return { type: "array" };
  }

  if (trimmed === "true" || trimmed === "false") {
    return { type: "boolean" };
  }

  if (/^-?\d+$/.test(trimmed)) {
    return { type: "integer" };
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return { type: "number" };
  }

  if (extractQuotedString(trimmed) !== undefined) {
    return { type: "string" };
  }

  return undefined;
}

function stripComments(source: string): string {
  let result = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      result += char;
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      result += char;
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (inTemplate) {
      result += char;
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      result += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      result += char;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      result += char;
      continue;
    }

    result += char;
  }

  return result;
}

function readBlockBody(source: string, openBraceIndex: number): string | undefined {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (inTemplate) {
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }

  return undefined;
}

function extractTopLevelReturnedExpressions(blockSource: string): string[] {
  const returnedExpressions: string[] = [];
  let current = "";
  let capturing = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = 0; index < blockSource.length; index += 1) {
    const char = blockSource[index]!;

    if (escaped) {
      if (capturing) current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      if (capturing) current += char;
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      if (capturing) current += char;
      if (char === "'") inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (capturing) current += char;
      if (char === '"') inDoubleQuote = false;
      continue;
    }

    if (inTemplate) {
      if (capturing) current += char;
      if (char === "`") inTemplate = false;
      continue;
    }

    if (char === "'") {
      if (capturing) current += char;
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      if (capturing) current += char;
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      if (capturing) current += char;
      inTemplate = true;
      continue;
    }

    if (!capturing && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const tail = blockSource.slice(index);
      const returnMatch = tail.match(/^return\b/);
      if (returnMatch) {
        capturing = true;
        current = "";
        index += returnMatch[0].length - 1;
        continue;
      }
    }

    if (char === "(") {
      parenDepth += 1;
      if (capturing) current += char;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      if (capturing) current += char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      if (capturing) current += char;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      if (capturing) current += char;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      if (capturing) current += char;
      continue;
    }

    if (char === "]") {
      bracketDepth -= 1;
      if (capturing) current += char;
      continue;
    }

    if (capturing && char === ";" && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const expression = current.trim();
      if (expression.length > 0) {
        returnedExpressions.push(expression);
      }
      current = "";
      capturing = false;
      continue;
    }

    if (capturing) {
      current += char;
    }
  }

  if (capturing) {
    const expression = current.trim();
    if (expression.length > 0) {
      returnedExpressions.push(expression);
    }
  }

  return returnedExpressions;
}

function extractReturnedExpression(source: string): string | undefined {
  const arrowIndex = source.indexOf("=>");

  if (arrowIndex !== -1) {
    const expressionSource = source.slice(arrowIndex + 2).trim();
    if (!expressionSource.startsWith("{")) {
      return expressionSource;
    }

    const openBraceIndex = source.indexOf("{", arrowIndex);
    if (openBraceIndex === -1) {
      return undefined;
    }

    const blockBody = readBlockBody(source, openBraceIndex);
    if (blockBody === undefined) {
      return undefined;
    }

    const returnedExpressions = extractTopLevelReturnedExpressions(blockBody);
    return returnedExpressions.length === 1 ? returnedExpressions[0] : undefined;
  }

  const openBraceIndex = source.indexOf("{");
  if (openBraceIndex === -1) {
    return undefined;
  }

  const blockBody = readBlockBody(source, openBraceIndex);
  if (blockBody === undefined) {
    return undefined;
  }

  const returnedExpressions = extractTopLevelReturnedExpressions(blockBody);
  return returnedExpressions.length === 1 ? returnedExpressions[0] : undefined;
}

function extractDirectCtxHelperCall(handler: RouteHandler): InferredHelperCall | undefined {
  const source = stripComments(handler.toString());
  const returnedExpression = extractReturnedExpression(source)?.replace(/^await\s+/, "").trim();
  if (!returnedExpression) {
    return undefined;
  }

  const match = returnedExpression.match(/^ctx\.(json|text|html|redirect|stream)\s*\(/);
  if (!match) {
    return undefined;
  }

  const kind = match[1] as InferredHelperKind;
  const openParenIndex = match[0].length - 1;
  const argsSource = readCallArguments(returnedExpression, openParenIndex);

  if (argsSource === undefined) {
    return undefined;
  }

  return {
    kind,
    args: splitTopLevelArguments(argsSource),
  };
}

function buildResponsesFromHandler(
  handler: RouteHandler,
): Record<string, OpenAPIResponse> | undefined {
  const helperCall = extractDirectCtxHelperCall(handler);
  if (!helperCall) {
    return undefined;
  }

  if (helperCall.kind === "redirect") {
    const statusCode = String(parseNumericLiteral(helperCall.args[1]) ?? 302);
    return {
      [statusCode]: {
        description: "Redirect",
      },
    };
  }

  let contentType: string;
  let schema: OpenAPISchema | undefined;
  let statusCode = 200;

  switch (helperCall.kind) {
    case "text":
      contentType = "text/plain";
      schema = { type: "string" };
      statusCode = parseNumericLiteral(helperCall.args[1]) ?? 200;
      break;
    case "html":
      contentType = "text/html";
      schema = { type: "string" };
      statusCode = parseNumericLiteral(helperCall.args[1]) ?? 200;
      break;
    case "json":
      contentType = "application/json";
      schema = inferLiteralSchema(helperCall.args[0]) ?? { type: "object" };
      statusCode = parseNumericLiteral(helperCall.args[1]) ?? 200;
      break;
    case "stream": {
      const inferredContentType = extractQuotedString(helperCall.args[1]) ?? "application/octet-stream";
      contentType = inferredContentType;
      schema = inferredContentType.startsWith("text/")
        ? { type: "string" }
        : { type: "string", format: "binary" };
      break;
    }
  }

  return {
    [String(statusCode)]: {
      description: getStatusDescription(String(statusCode)),
      content: {
        [contentType]: {
          schema: schema!,
        },
      },
    },
  };
}

// ---- 路由同步 ----

/**
 * 自动将 Router 中已注册的所有路由同步到 OpenAPIGenerator
 * @param router - VentoStack 路由实例
 * @param generator - OpenAPI 生成器实例
 *
 * 读取逻辑（优先级从高到低）：
 * 1. 路由 metadata?.openapi 中的手动声明
 * 2. 路由 schemaConfig 中定义的 query / body / responses 自动生成
 * 3. 默认 200 响应作为兜底
 */
export function syncRouterToOpenAPI(
  router: Router,
  generator: OpenAPIGenerator,
  options: SyncRouterToOpenAPIOptions = {},
): void {
  const excludedPaths = new Set(options.excludePaths ?? []);

  for (const route of router.routes()) {
    if (excludedPaths.has(route.path)) {
      continue;
    }

    const openapiMeta = route.metadata?.openapi as Partial<OpenAPIOperation> | undefined;
    const schemaConfig = route.schemaConfig as RouteSchemaConfig | undefined;

    // 响应：openapiMeta > schemaConfig > 简单 handler 推断 > default
    const autoResponses = buildResponsesFromSchemaConfig(schemaConfig);
    const inferredResponses = autoResponses === undefined ? buildResponsesFromHandler(route.handler) : undefined;
    const operation: OpenAPIOperation = {
      responses: openapiMeta?.responses ?? autoResponses ?? inferredResponses ?? {
        "200": { description: "Success" },
      },
    };

    // 参数：合并 schemaConfig.query 与 openapiMeta.parameters（后者优先级更高）
    const autoParams = buildParametersFromSchemaConfig(schemaConfig);
    if (openapiMeta?.parameters !== undefined) {
      const paramMap = new Map(autoParams.map((p) => [`${p.in}:${p.name}`, p]));
      for (const param of openapiMeta.parameters) {
        paramMap.set(`${param.in}:${param.name}`, param);
      }
      operation.parameters = Array.from(paramMap.values());
    } else if (autoParams.length > 0) {
      operation.parameters = autoParams;
    }

    // 请求体：openapiMeta > schemaConfig.body
    if (openapiMeta?.requestBody !== undefined) {
      operation.requestBody = openapiMeta.requestBody;
    } else {
      const autoRequestBody = buildRequestBodyFromSchemaConfig(schemaConfig);
      if (autoRequestBody) operation.requestBody = autoRequestBody;
    }

    // 其他元数据字段（手动声明优先）
    if (openapiMeta?.summary !== undefined) operation.summary = openapiMeta.summary;
    if (openapiMeta?.description !== undefined) operation.description = openapiMeta.description;
    if (openapiMeta?.tags !== undefined) operation.tags = openapiMeta.tags;
    if (openapiMeta?.operationId !== undefined) operation.operationId = openapiMeta.operationId;
    if (openapiMeta?.security !== undefined) operation.security = openapiMeta.security;
    if (openapiMeta?.deprecated !== undefined) operation.deprecated = openapiMeta.deprecated;

    generator.addPath(route.path, route.method, operation);
  }
}
