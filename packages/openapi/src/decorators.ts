// ============================================================
// @aeron/openapi — Route Metadata (decorators.ts)
// 函数式路由元数据定义与 OpenAPI 转换
// ============================================================

import type {
  OpenAPIGenerator,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
} from "./generator";

export interface RouteMetadata {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

/**
 * 定义单条路由的 OpenAPI 元数据。
 * 返回原样元数据，可用于后续批量注入生成器。
 */
export function defineRouteDoc(metadata: RouteMetadata): RouteMetadata {
  return metadata;
}

/**
 * 将一组路由元数据批量注入到 OpenAPIGenerator 中。
 */
export function routesToOpenAPI(
  routes: RouteMetadata[],
  generator: OpenAPIGenerator,
): void {
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
