// @aeron/core - 统一响应格式

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export function success<T>(
  data?: T,
  message = "ok",
  status = 200,
): Response {
  const body: ApiResponse<T> = { code: 0, message };
  if (data !== undefined) {
    body.data = data;
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function fail(
  message: string,
  code = -1,
  status = 400,
): Response {
  const body: ApiResponse = { code, message };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Response {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const body: ApiResponse<PaginatedData<T>> = {
    code: 0,
    message: "ok",
    data: { items, total, page, pageSize, totalPages },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
