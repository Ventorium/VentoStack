/**
 * AI 链路追踪路由 OpenAPI Schema 辅助
 * 使 /api/ai/trace 路由纳入 OpenAPI 契约，前端可通过 o2t 生成类型。
 */
import type { RouteSchemaConfig, SchemaField } from "@ventostack/core";

/** 链路追踪路由统一 OpenAPI 标签 */
export const TRACE_TAG = "ai-trace";

/** 构造带 summary/tags 的基础路由 schema，可叠加 query/body/responses */
export function routeDoc(summary: string, extra?: Partial<RouteSchemaConfig>): RouteSchemaConfig {
  return {
    openapi: { summary, tags: [TRACE_TAG] },
    ...extra,
  };
}

/** 列表分页查询参数（通用） */
export const paginationQuery: Record<string, SchemaField> = {
  page: { type: "int", default: 1, description: "页码" },
  pageSize: { type: "int", default: 20, description: "每页数量" },
};
