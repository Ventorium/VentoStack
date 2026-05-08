// @ventostack/core - 统一响应格式

/** API 统一响应结构 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码 */
  code: number;
  /** 响应消息 */
  message: string;
  /** 响应数据 */
  data?: T;
}

/** 分页数据结构 */
export interface PaginatedData<T> {
  /** 当前页数据列表 */
  items: T[];
  /** 总记录数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页大小 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * 返回成功响应
 * @param data - 响应数据
 * @param message - 响应消息，默认 "成功"
 * @param status - HTTP 状态码，默认 200
 * @returns Response 对象
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
 * 返回失败响应
 * @param message - 错误消息
 * @param code - 业务错误码，默认 -1
 * @param status - HTTP 状态码，默认 400
 * @returns Response 对象
 */
export function fail(message: string, code = -1, status = 400): Response {
  const body: ApiResponse = { code, message };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * 返回分页响应
 * @param items - 当前页数据
 * @param total - 总记录数
 * @param page - 当前页码
 * @param pageSize - 每页大小
 * @returns Response 对象
 */
export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Response {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const body: ApiResponse<PaginatedData<T>> = {
    code: 0,
    message: "成功",
    data: { items, total, page, pageSize, totalPages },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
