/**
 * @ventostack/system - 路由通用工具
 */

/** 统一 JSON 响应头 */
export const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** 成功响应 */
export function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "成功", data }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

/** 分页成功响应 */
export function okPage(list: unknown[], total: number, page: number, pageSize: number): Response {
  return new Response(
    JSON.stringify({
      code: 0,
      message: "成功",
      data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 },
    }),
    { status: 200, headers: JSON_HEADERS },
  );
}

/** 错误响应 */
export function fail(message: string, code = 400, status = 400, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ code, message, data: extra ?? null }), {
    status,
    headers: JSON_HEADERS,
  });
}

/** 从请求体解析 JSON */
export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** 从 query 获取分页参数 */
export function pageOf(query: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 10)),
  };
}
