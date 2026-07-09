import { globalNavigate } from "@/components/GlobalHistory";
import { msg } from "@/components/GlobalMessage";
import {
  clearToken,
  getAccessToken,
  setAccessToken,
  setRefreshToken,
} from "@/store/token";
import { createFetchClient } from "@doremijs/o2t/client";
import type { OpenAPIs } from "./schema";

// ---------------------------------------------------------------------------
// Token refresh state — module-level to coordinate concurrent 401 retries
// ---------------------------------------------------------------------------
let isRefreshing = false;
type QueueEntry = { resolve: () => void; reject: (reason?: unknown) => void };
const refreshQueue: QueueEntry[] = [];

async function refreshAccessToken(): Promise<boolean> {
  isRefreshing = true;
  try {
    const { error, data } = await rawClient.post("/api/auth/refresh", {
      body: {},
    } as never);
    if (!error && data?.accessToken) {
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      // Flush queued requests with the new token
      const queue = refreshQueue.splice(0);
      for (const entry of queue) {
        entry.resolve();
      }
      return true;
    }
    // Refresh itself failed — reject all queued requests
    abortPendingRequests("Token refresh failed");
    return false;
  } catch {
    abortPendingRequests("Token refresh failed");
    return false;
  } finally {
    isRefreshing = false;
  }
}

/** Reject all pending refresh queue entries and redirect to login. */
function abortPendingRequests(reason: string): void {
  clearToken();
  const queue = refreshQueue.splice(0);
  for (const entry of queue) {
    entry.reject(new Error(reason));
  }
  setTimeout(() => globalNavigate("/auth/login", { replace: true }), 0);
}

// ---------------------------------------------------------------------------
// Underlying typed client
// ---------------------------------------------------------------------------
const rawClient = createFetchClient<OpenAPIs>({
  requestTimeoutMs: 10000,
  requestInterceptor(request) {
    request.init.credentials = "include";
    const token = getAccessToken();
    if (!["/api/login", "/api/auth/refresh"].includes(request.url) && token) {
      request.init.headers.Authorization = `Bearer ${token}`;
    }
    return request;
  },
  async responseInterceptor(_request, response) {
    // 仅处理成功响应的信封解包 { code, message, data } → data
    if (!response.ok) return response;

    const ct = response.headers.get("content-type");
    if (!ct?.includes("application/json")) return response;

    const json: unknown = await response.clone().json();
    if (!json || typeof json !== "object" || !("code" in json)) return response;

    const envelope = json as { code: number; message?: string; data?: unknown };

    // code !== 0 业务错误，转为 400 由 errorHandler 统一处理
    if (envelope.code !== 0) {
      return new Response(
        JSON.stringify({ code: envelope.code, message: envelope.message || "请求失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // code=0 成功，解包 data
    return new Response(JSON.stringify(envelope.data ?? null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
  async errorHandler(_request, response, error) {
    // 网络错误
    if (error) {
      const msgMap: Record<string, string> = {
        "Failed to fetch": "网络连接失败，请检查网络",
        "The user aborted a request": "请求已取消",
        NetworkError: "网络连接失败，请检查网络",
        TimeoutError: "请求超时，请稍后重试",
      };
      const key = Object.keys(msgMap).find((k) => error.message.includes(k));
      msg.error(key ? msgMap[key] : "请求失败，请稍后重试");
      return;
    }

    if (!response) return;

    // 401 — token 过期或登录失败
    if (response.status === 401) {
      // 无任何 token（如登录接口），尝试显示服务端返回的错误消息
      if (!getAccessToken()) {
        try {
          const json: unknown = await response.clone().json();
          if (json && typeof json === "object" && "message" in json) {
            msg.error((json as { message: string }).message);
          }
        } catch {
          msg.error("登录失败");
        }
        return;
      }
      // 有 access token 但无 refresh token，清除并跳转登录页
      clearToken();
      globalNavigate("/auth/login", { replace: true });
      return;
    }

    // 400 — 业务错误（code !== 0 被转为 400）
    if (response.status === 400) {
      try {
        const json: unknown = await response.clone().json();
        if (json && typeof json === "object" && "message" in json) {
          msg.error((json as { message: string }).message);
        }
      } catch {
        msg.error("请求失败");
      }
      return;
    }

    // 403 — 登录接口的密码过期由业务层处理，其他 403 显示错误信息
    if (response.status === 403) {
      try {
        const json: unknown = await response.clone().json();
        if (json && typeof json === "object" && "data" in json) {
          const data = (json as { data: unknown }).data;
          if (
            data &&
            typeof data === "object" &&
            "code" in data &&
            (data as { code: string }).code === "password_expired"
          ) {
            return; // 登录密码过期，由 useAuth.login() 处理
          }
        }
        if ("message" in (json as object)) {
          msg.error((json as { message: string }).message || "没有权限");
        }
      } catch {
        msg.error("没有权限");
      }
      return;
    }

    // 其他服务端错误（500/502 等）
    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const resp: unknown = await response.clone().json();
        if (resp && typeof resp === "object" && "message" in resp) {
          msg.error((resp as { message: string }).message || "服务器错误");
        } else {
          msg.error("服务器错误");
        }
      } else {
        const text = await response.text();
        msg.error(text || "服务器错误");
      }
    } catch {
      msg.error("服务器错误");
    }
  },
});

// ---------------------------------------------------------------------------
// Public client — wraps rawClient with automatic token refresh on 401
// ---------------------------------------------------------------------------

type HttpMethod = "get" | "post" | "put" | "delete" | "patch";

function isAuthPath(url: string): boolean {
  return (
    url.startsWith("/api/auth/login") ||
    url.startsWith("/api/auth/register") ||
    url.startsWith("/api/auth/refresh") ||
    url.startsWith("/api/auth/passkey/")
  );
}

/** Strip Authorization header so the request interceptor can re-add the fresh token. */
function stripAuthHeader(
  options: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!options?.headers) return options;
  const { Authorization: _, ...rest } = options.headers as Record<string, string>;
  return { ...options, headers: Object.keys(rest).length > 0 ? rest : undefined };
}

type ClientResult = { error: boolean; response?: Response; data: unknown };

async function requestWithRefresh(
  method: HttpMethod,
  path: string,
  options?: Record<string, unknown>,
): Promise<ClientResult> {
  const methodFn = rawClient[method] as (p: string, o?: unknown) => Promise<ClientResult>;
  const result = await methodFn(path, options);

  // Only attempt refresh for 401 on non-auth paths. Browser refresh tokens live in HttpOnly cookies.
  if (result.error && result.response?.status === 401 && !isAuthPath(path)) {
    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      try {
        await new Promise<void>((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        });
        return methodFn(path, stripAuthHeader(options));
      } catch {
        // Refresh was rejected (token expired, session invalid) — return original error
        return result;
      }
    }

    // Initiate refresh
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return methodFn(path, stripAuthHeader(options));
    }
  }

  return result;
}

/**
 * Type-safe API client with automatic token refresh on 401.
 *
 * Delegates to the underlying `rawClient` for all requests. When a 401 is
 * received on a non-auth endpoint and a refresh token is available, the
 * request is transparently retried after a successful token refresh.
 * Concurrent 401s are coalesced into a single refresh call.
 */
export const client = new Proxy(rawClient, {
  get(target, prop: string) {
    if (["get", "post", "put", "delete", "patch"].includes(prop)) {
      return (path: string, options?: Record<string, unknown>) =>
        requestWithRefresh(prop as HttpMethod, path, options);
    }
    return Reflect.get(target, prop);
  },
}) as typeof rawClient;
