// @ventostack/core - 统一响应格式 + 路由公共工具
//
// 所有平台模块必须从 @ventostack/core 引用，禁止在 routes/common.ts 中重复实现。

import { VentoStackError } from "./errors";

/** 统一 JSON 响应头 */
export const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** API 统一响应结构 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码：0=成功，非 0=失败 */
  code: number;
  /** 响应消息 */
  message: string;
  /** 响应数据 */
  data?: T;
}

/** 分页数据结构 */
export interface PaginatedData<T> {
  /** 当前页数据列表 */
  list: T[];
  /** 总记录数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页大小 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

/**
 * 成功响应
 * @param data - 响应数据
 * @param message - 响应消息，默认 "成功"
 * @param status - HTTP 状态码，默认 200
 */
export function success<T>(data?: T, message = "成功", status = 200): Response {
  const body: ApiResponse<T> = { code: 0, message };
  if (data !== undefined) {
    body.data = data;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * 失败响应
 * @param message - 错误消息
 * @param code - 业务错误码，默认 400
 * @param status - HTTP 状态码，默认 400
 * @param data - 附加数据（可选）
 */
export function fail(message: string, code = 400, status = 400, data?: unknown): Response {
  const body: ApiResponse = { code, message, data: data ?? null };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * 分页响应
 * @param list - 当前页数据
 * @param total - 总记录数
 * @param page - 当前页码
 * @param pageSize - 每页大小
 */
export function paginated<T>(list: T[], total: number, page: number, pageSize: number): Response {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const body: ApiResponse<PaginatedData<T>> = {
    code: 0,
    message: "成功",
    data: { list, total, page, pageSize, totalPages },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

// ========== 路由公共工具 ==========

/**
 * 从请求体解析 JSON，空 body 返回空对象
 */
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * 从 query 参数中提取分页参数，带安全边界
 */
export function pageOf(query: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 10)),
  };
}

/**
 * 统一错误处理：VentoStackError 保留业务码，其余走 500
 */
export function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    const status = e.code >= 400 && e.code < 600 ? e.code : 400;
    return fail(e.message, status, status);
  }
  return fail(e instanceof Error ? e.message : "服务器内部错误", 500, 500);
}
