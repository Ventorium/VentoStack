/**
 * AI 路由 OpenAPI Schema 辅助
 * 为 AI 路由提供统一的路由文档声明（summary/tags）与常用参数片段，
 * 使 /api/ai 路由纳入 OpenAPI 契约，前端可通过 o2t 生成类型。
 */
import type { RouteSchemaConfig, SchemaField } from '@ventostack/core';

/** AI 路由统一 OpenAPI 标签 */
export const AI_TAG = 'ai';

/** 列表分页查询参数（通用） */
export const paginationQuery: Record<string, SchemaField> = {
  page: { type: 'int', default: 1, description: '页码' },
  pageSize: { type: 'int', default: 20, description: '每页数量' },
};

/** 构造带 summary/tags 的基础路由 schema，可叠加 query/body/responses */
export function routeDoc(summary: string, extra?: Partial<RouteSchemaConfig>): RouteSchemaConfig {
  return {
    openapi: { summary, tags: [AI_TAG] },
    ...extra,
  };
}

/** 宽松 200 响应（未穷尽字段，保证类型可用） */
export function okResponse(fields: Record<string, SchemaField>): RouteSchemaConfig['responses'] {
  return {
    200: {
      ...fields,
    },
  };
}
