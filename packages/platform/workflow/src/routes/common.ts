/**
 * 通用响应辅助函数
 */

export function ok(data: unknown) {
  return new Response(JSON.stringify({ code: 0, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function okPage(items: unknown[], total: number, page: number, pageSize: number) {
  return new Response(JSON.stringify({ code: 0, data: { list: items, total, page, pageSize } }), {
    headers: { "Content-Type": "application/json" },
  });
}

export function fail(message: string, code = 500, status = 200) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function pageOf(query: Record<string, unknown>): { page: number; pageSize: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  return { page, pageSize };
}
