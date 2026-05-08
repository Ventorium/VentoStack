/**
 * @ventostack/gen - 路由通用工具
 */

export const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: "成功", data }), {
    status: 200, headers: JSON_HEADERS,
  });
}

export function okPage(list: unknown[], total: number, page: number, pageSize: number): Response {
  return new Response(
    JSON.stringify({ code: 0, message: "成功", data: { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 } }),
    { status: 200, headers: JSON_HEADERS },
  );
}

export function fail(message: string, code = 400, status = 400): Response {
  return new Response(JSON.stringify({ code, message, data: null }), { status, headers: JSON_HEADERS });
}

export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function pageOf(query: Record<string, unknown>): { page: number; pageSize: number } {
  return { page: Math.max(1, Number(query.page) || 1), pageSize: Math.min(100, Math.max(1, Number(query.pageSize) || 10)) };
}
