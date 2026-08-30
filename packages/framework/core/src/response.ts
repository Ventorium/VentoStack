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

/** parseBody 默认请求体上限：1MB（可通过 configureMaxBodySize 按应用调整） */
export const DEFAULT_MAX_BODY_SIZE = 1024 * 1024;

/** 应用级请求体上限（字节）；未配置时回落 DEFAULT_MAX_BODY_SIZE */
let configuredMaxBodySize: number | undefined;

/**
 * 配置全局默认请求体上限（字节）。应在应用装配阶段调用一次；
 * 单次调用可用 parseBody(request, { maxSize }) 临时覆盖。
 */
export function configureMaxBodySize(bytes: number): void {
  if (!Number.isInteger(bytes) || bytes < 1024) {
    throw new Error("maxBodySize 必须是不小于 1024 的整数字节数");
  }
  configuredMaxBodySize = bytes;
}

/** 当前生效的全局默认上限（字节） */
export function getMaxBodySize(): number {
  return configuredMaxBodySize ?? DEFAULT_MAX_BODY_SIZE;
}

/**
 * 从请求体解析 JSON，空 body 返回空对象。
 * 超过大小上限（Content-Length 预检 + 实际字节数兜底）时抛出 413 VentoStackError，
 * 防止无上限的 JSON 体耗尽内存（DoS）。
 */
export async function parseBody<T = Record<string, unknown>>(
  request: Request,
  options?: { maxSize?: number },
): Promise<T> {
  const maxSize = options?.maxSize ?? getMaxBodySize();
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxSize) {
    throw new VentoStackError(`请求体过大，最大 ${Math.floor(maxSize / 1024)}KB`, 413, "PAYLOAD_TOO_LARGE");
  }
  const text = await request.text();
  if (!text) return {} as T;
  // chunked 等无 Content-Length 的请求按实际字节数兜底校验
  if (Buffer.byteLength(text) > maxSize) {
    throw new VentoStackError(`请求体过大，最大 ${Math.floor(maxSize / 1024)}KB`, 413, "PAYLOAD_TOO_LARGE");
  }
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
 * 统一错误处理：VentoStackError 保留业务码，其余走 500（不泄露内部错误详情）
 */
export function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    const status = e.code >= 400 && e.code < 600 ? e.code : 400;
    return fail(e.message, status, status);
  }
  // 非框架异常：返回固定脱敏文案，避免 SQL 细节 / 内部路径 / 供应商响应泄露。
  // 完整错误信息应由调用方记录到服务端日志（如 logger.error(e)）。
  return fail("服务器内部错误", 500, 500);
}

/**
 * 将异常转换为安全的对外错误消息：
 * - VentoStackError 保留业务消息（可安全展示）
 * - 其他异常一律返回 fallback 文案，避免泄露内部细节
 */
export function safeErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof VentoStackError) return e.message;
  return fallback;
}
