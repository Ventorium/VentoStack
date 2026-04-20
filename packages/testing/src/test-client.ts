// @aeron/testing - HTTP 测试客户端

export interface TestResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
  readonly text: string;
  json<T = unknown>(): T;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export interface TestClient {
  get(path: string, options?: RequestOptions): Promise<TestResponse>;
  post(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  put(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  patch(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  delete(path: string, options?: RequestOptions): Promise<TestResponse>;
  setHeader(name: string, value: string): TestClient;
  setHeaders(headers: Record<string, string>): TestClient;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string>,
): string {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function mergeHeaders(
  defaults: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  return { ...defaults, ...overrides };
}

async function buildTestResponse(response: Response): Promise<TestResponse> {
  const text = await response.text();
  let body: unknown = text;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
    text,
    json<T = unknown>(): T {
      if (typeof body === "object" && body !== null) {
        return body as T;
      }
      return JSON.parse(text) as T;
    },
  };
}

export function createTestClient(baseUrl: string): TestClient {
  const defaultHeaders: Record<string, string> = {};

  async function request(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<TestResponse> {
    const url = buildUrl(baseUrl, path, options?.query);
    const headers = mergeHeaders(defaultHeaders, options?.headers);

    const init: RequestInit = { method, headers };

    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        init.body = body;
      } else {
        init.body = JSON.stringify(body);
        if (!headers["content-type"] && !headers["Content-Type"]) {
          (init.headers as Record<string, string>)["content-type"] =
            "application/json";
        }
      }
    }

    const response = await fetch(url, init);
    return buildTestResponse(response);
  }

  const client: TestClient = {
    get(path, options?) {
      return request("GET", path, undefined, options);
    },
    post(path, body?, options?) {
      return request("POST", path, body, options);
    },
    put(path, body?, options?) {
      return request("PUT", path, body, options);
    },
    patch(path, body?, options?) {
      return request("PATCH", path, body, options);
    },
    delete(path, options?) {
      return request("DELETE", path, undefined, options);
    },
    setHeader(name, value) {
      defaultHeaders[name] = value;
      return client;
    },
    setHeaders(headers) {
      for (const [name, value] of Object.entries(headers)) {
        defaultHeaders[name] = value;
      }
      return client;
    },
  };

  return client;
}
