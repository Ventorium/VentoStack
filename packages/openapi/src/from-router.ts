// ============================================================
// @ventostack/openapi — 从路由 Schema 推导 OpenAPI
// ============================================================

import type { OpenAPIParameter, OpenAPIRequestBody, OpenAPIOperation, OpenAPIResponse } from "./generator";
import type { OpenAPISchema } from "./schema-builder";
import { isRouteResponseConfig } from "@ventostack/core";
import type { RouteResponseDefinition, RouteSchemaConfig, SchemaField, SchemaFieldType } from "@ventostack/core";

/**
 * 将 SchemaFieldType 映射为 OpenAPI 类型
 */
function mapType(type: SchemaFieldType): { type: string; format?: string } {
  switch (type) {
    case "string":
    case "uuid":
      return { type: "string" };
    case "int":
      return { type: "integer" };
    case "float":
    case "number":
      return { type: "number" };
    case "bool":
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date-time" };
    case "array":
      return { type: "array" };
    case "object":
      return { type: "object" };
    case "file":
      return { type: "string", format: "binary" };
    default:
      return { type: "string" };
  }
}

/**
 * 将 SchemaField 转换为 OpenAPISchema
 * @param field - SchemaField 定义
 * @returns OpenAPISchema 对象
 */
export function schemaFieldToOpenAPI(field: SchemaField): OpenAPISchema {
  const { type: openApiType, format } = mapType(field.type);
  const schema: OpenAPISchema = { type: openApiType };

  if (format) schema.format = format;
  if (field.description) schema.description = field.description;
  if (field.example !== undefined) schema.example = field.example;
  if (field.enum !== undefined) schema.enum = [...field.enum];

  // string / uuid
  if (field.type === "string" || field.type === "uuid") {
    if (field.min !== undefined) schema.minLength = field.min;
    if (field.max !== undefined) schema.maxLength = field.max;
    if (field.pattern) schema.pattern = field.pattern.source;
  }

  // number / int / float
  if (field.type === "number" || field.type === "int" || field.type === "float") {
    if (field.min !== undefined) schema.minimum = field.min;
    if (field.max !== undefined) schema.maximum = field.max;
  }

  // array
  if (field.type === "array" && field.items) {
    schema.items = schemaFieldToOpenAPI(field.items);
  }

  // object
  if (field.type === "object" && field.properties) {
    schema.properties = {};
    const required: string[] = [];
    for (const [key, prop] of Object.entries(field.properties)) {
      schema.properties[key] = schemaFieldToOpenAPI(prop);
      if (prop.required) required.push(key);
    }
    if (required.length > 0) schema.required = required;
  }

  return schema;
}

/**
 * 将 Schema 对象转换为 OpenAPISchema（object 类型）
 * @param schema - Record<string, SchemaField>
 * @returns OpenAPISchema 对象
 */
export function schemaToOpenAPIObject(schema: Record<string, SchemaField>): OpenAPISchema {
  const result: OpenAPISchema = { type: "object", properties: {} };
  const required: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    result.properties![key] = schemaFieldToOpenAPI(field);
    if (field.required) required.push(key);
  }

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

/**
 * 从 query schema 生成 OpenAPI 参数列表
 * @param querySchema - 查询参数 schema
 * @returns OpenAPIParameter 数组
 */
export function querySchemaToParameters(querySchema: Record<string, SchemaField>): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = [];
  for (const [key, field] of Object.entries(querySchema)) {
    const param: OpenAPIParameter = {
      name: key,
      in: "query",
      schema: schemaFieldToOpenAPI(field),
    };
    if (field.required) param.required = true;
    if (field.description) param.description = field.description;
    params.push(param);
  }
  return params;
}

/**
 * 从 headers schema 生成 OpenAPI 参数列表
 * @param headersSchema - 请求头 schema
 * @returns OpenAPIParameter 数组
 */
export function headersSchemaToParameters(headersSchema: Record<string, SchemaField>): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = [];
  for (const [key, field] of Object.entries(headersSchema)) {
    const param: OpenAPIParameter = {
      name: key,
      in: "header",
      schema: schemaFieldToOpenAPI(field),
    };
    if (field.required) param.required = true;
    if (field.description) param.description = field.description;
    params.push(param);
  }
  return params;
}

/**
 * 从 body schema 生成 OpenAPI 请求体
 * @param bodySchema - 请求体 schema
 * @returns OpenAPIRequestBody 对象
 */
export function bodySchemaToRequestBody(bodySchema: Record<string, SchemaField>): OpenAPIRequestBody {
  return {
    required: Object.values(bodySchema).some((f) => f.required),
    content: {
      "application/json": { schema: schemaToOpenAPIObject(bodySchema) },
    },
  };
}

/**
 * 从 formData schema 生成 OpenAPI 请求体
 * @param formDataSchema - FormData schema
 * @returns OpenAPIRequestBody 对象
 */
export function formDataSchemaToRequestBody(formDataSchema: Record<string, SchemaField>): OpenAPIRequestBody {
  return {
    required: Object.values(formDataSchema).some((f) => f.required),
    content: {
      "multipart/form-data": { schema: schemaToOpenAPIObject(formDataSchema) },
    },
  };
}

/**
 * 从响应 schema 生成 OpenAPI 响应映射
 * @param responsesSchema - 响应 schema 配置
 * @returns Record<string, OpenAPIResponse>
 */
export function responsesSchemaToResponses(
  responsesSchema: Record<number | string, RouteResponseDefinition>,
): Record<string, OpenAPIResponse> {
  const responses: Record<string, OpenAPIResponse> = {};

  for (const [statusCode, responseDef] of Object.entries(responsesSchema)) {
    const isConfiguredResponse = isRouteResponseConfig(responseDef);
    const contentType = isConfiguredResponse ? responseDef.contentType : "application/json";
    const description = isConfiguredResponse ? responseDef.description : undefined;
    const schema = isConfiguredResponse ? responseDef.schema : responseDef;

    let openApiSchema: OpenAPISchema;
    if (schema.type !== undefined) {
      // 单个 SchemaField
      openApiSchema = schemaFieldToOpenAPI(schema as SchemaField);
    } else {
      // Record<string, SchemaField>
      openApiSchema = schemaToOpenAPIObject(schema as Record<string, SchemaField>);
    }

    responses[String(statusCode)] = {
      description: description ?? `Response ${statusCode}`,
      content: {
        [contentType]: { schema: openApiSchema },
      },
    };
  }

  return responses;
}

/**
 * 从 RouteSchemaConfig 生成完整的 OpenAPI Operation
 * @param config - 路由 schema 配置
 * @returns OpenAPIOperation 对象
 */
export function routeConfigToOpenAPIOperation(config: RouteSchemaConfig): OpenAPIOperation {
  const parameters: OpenAPIParameter[] = [];
  let requestBody: OpenAPIRequestBody | undefined;
  let responses: Record<string, OpenAPIResponse> = {};

  if (config.query) {
    parameters.push(...querySchemaToParameters(config.query));
  }

  if (config.headers) {
    parameters.push(...headersSchemaToParameters(config.headers));
  }

  if (config.body) {
    requestBody = bodySchemaToRequestBody(config.body);
  } else if (config.formData) {
    requestBody = formDataSchemaToRequestBody(config.formData);
  }

  if (config.responses) {
    responses = responsesSchemaToResponses(config.responses);
  } else {
    // 默认 200 响应
    responses["200"] = { description: "Success" };
  }

  const operation: OpenAPIOperation = {
    responses,
  };

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  if (requestBody !== undefined) {
    operation.requestBody = requestBody;
  }

  return operation;
}
