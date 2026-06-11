/**
 * 路由公共辅助函数
 */
import { VentoStackError } from "@ventostack/core";

export function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 1, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function okPage(
  list: unknown[],
  total: number,
  page: number,
  pageSize: number,
): Response {
  return new Response(
    JSON.stringify({ code: 1, data: { list, total, page, pageSize } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export function fail(message: string, status = 200, code = 0): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    return new Response(
      JSON.stringify({ code: 0, error: e.errorCode, message: e.message }),
      {
        status: e.code >= 400 && e.code < 600 ? e.code : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return fail(e instanceof Error ? e.message : "服务器内部错误", 500, 500);
}

export async function parseBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function pageOf(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize };
}
