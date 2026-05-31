# Admin Web Frontend Security Audit
## 1. API Client
```typescript
import { globalNavigate } from "@/components/GlobalHistory";
import { msg } from "@/components/GlobalMessage";
import {
  clearToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/store/token";
import { createFetchClient } from "@doremijs/o2t/client";
import type { OpenAPIs } from "./schema";

// ---------------------------------------------------------------------------
// Token refresh state — module-level to coordinate concurrent 401 retries
// ---------------------------------------------------------------------------
let isRefreshing = false;
const refreshQueue: Array<() => void> = [];

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  isRefreshing = true;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    // Backend wraps responses in { code, message, data }
    const data = json?.data ?? json;
    if (res.ok && data?.accessToken) {
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      // Flush queued requests with the new token
      const queue = refreshQueue.splice(0);
      for (const resolve of queue) {
        resolve();
      }
      return true;
    }
    // Refresh itself failed — clean up and redirect
    clearToken();
    globalNavigate("/auth/login", { replace: true });
    return false;
  } catch {
    clearToken();
    globalNavigate("/auth/login", { replace: true });
    return false;
  } finally {
    isRefreshing = false;
  }
}

// ---------------------------------------------------------------------------
// Underlying typed client
// ---------------------------------------------------------------------------
const rawClient = createFetchClient<OpenAPIs>({
  requestTimeoutMs: 10000,
  requestInterceptor(request) {
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

    // 401 — token 过期：由 requestWithRefresh 处理刷新，此处不显示错误
    if (response.status === 401) {
      // 有 refresh token 时，静默等待 requestWithRefresh 处理刷新
      if (getRefreshToken()) return;
      // 无 refresh token，走原有逻辑
      if (getAccessToken()) {
        clearToken();
        globalNavigate("/auth/login", { replace: true });
      }
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

  // Only attempt refresh for 401 on non-auth paths when a refresh token exists
  if (result.error && result.response?.status === 401 && !isAuthPath(path) && getRefreshToken()) {
    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      await new Promise<void>((resolve) => {
        refreshQueue.push(resolve);
      });
      return methodFn(path, stripAuthHeader(options));
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
```
## 2. Auth Store
```typescript
import { client } from "@/api";
import { globalNavigate } from "@/components/GlobalHistory";
import { startAuthentication } from "@simplewebauthn/browser";
import { create } from "zustand";
import { clearToken, getAccessToken, setAccessToken, setRefreshToken } from "./token";

interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  avatar: string;
  gender: number;
  status: number;
  deptId: string;
  deptName: string;
  roles: string[];
  permissions: string[];
}

export type LoginForm = { username: string; password: string; remember?: boolean };

export type PasswordExpiredInfo = { code: "password_expired"; tempToken: string };

export type MfaRequiredInfo = { code: "mfa_required"; mfaToken: string };

export type LoginResult = UserProfile | PasswordExpiredInfo | MfaRequiredInfo | null;

export type AuthState = {
  user: UserProfile | null;
  ready: boolean;
  loading: boolean;
  computed: { logged: boolean };
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchUser: (patch: Partial<UserProfile>) => void;
  login: (args: LoginForm) => Promise<LoginResult>;
  completeMFALogin: (mfaToken: string, code: string) => Promise<LoginResult>;
  passkeyLogin: (username: string) => Promise<LoginResult>;
  logout: () => void;
};

function onExpired() {
  clearToken();
  globalNavigate("/auth/login", { replace: true });
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  loading: false,
  computed: {
    get logged() {
      return !!get().user;
    },
  },
  async refreshProfile() {
    const { data: user } = (await client.get("/api/system/user/profile")) as {
      data?: UserProfile;
      error?: unknown;
    };
    if (user) set({ user });
  },
  patchUser(patch) {
    const { user } = get();
    if (user) set({ user: { ...user, ...patch } });
  },
  async init() {
    if (get().loading) return;
    set({ loading: true });
    const accessToken = getAccessToken();
    if (accessToken) {
      const { data: user, error } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (!error && user) {
        set({ user });
      } else {
        clearToken();
      }
    }
    set({ loading: false, ready: true });
  },
  async login(args) {
    const { error, data, response } = (await client.post("/api/auth/login", { body: args })) as {
      error?: unknown;
      data?: any;
      response?: Response;
    };
    // 密码过期：从原始 403 响应中提取 tempToken
    if (response?.status === 403) {
      try {
        const json: any = await response.clone().json();
        if (json?.data?.code === "password_expired" && json.data.tempToken) {
          return { code: "password_expired" as const, tempToken: json.data.tempToken };
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    if (!error && data) {
      // MFA required — return mfaToken for second step
      if (data.mfaRequired && data.mfaToken) {
        return { code: "mfa_required" as const, mfaToken: data.mfaToken };
      }
      // Normal login success
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        const result: UserProfile & { mfaSetupRequired?: boolean } = { ...user };
        if (data.mfaSetupRequired) {
          result.mfaSetupRequired = true;
        }
        set({ user });
        return result;
      }
    }
    return null;
  },
  async completeMFALogin(mfaToken, code) {
    const { error, data } = (await client.post("/api/auth/mfa/login", {
      body: { mfaToken, code },
    })) as {
      data?: { accessToken: string; refreshToken: string; expiresIn: number; sessionId: string };
      error?: unknown;
    };
    if (!error && data) {
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        set({ user });
        return user;
      }
    }
    return null;
  },
  async passkeyLogin(username) {
    try {
      const { error: beginError, data: resp } = await client.post("/api/auth/passkey/login-begin", {
        body: { username },
      } as any);
      if (beginError || !resp) return null;
      const beginData = (resp as any).data ?? resp;
      if (!beginData?.options) return null;

      const assertion = await startAuthentication({ optionsJSON: beginData.options });
      const { error: finishError, data: finishResp } = await client.post(
        "/api/auth/passkey/login-finish",
        {
          body: { challengeId: beginData.challengeId, assertion },
        } as any,
      );
      if (finishError || !finishResp) return null;
      const finishData = (finishResp as any).data ?? finishResp;

      setAccessToken(finishData.accessToken);
      if (finishData.refreshToken) setRefreshToken(finishData.refreshToken);
      const { data: user } = (await client.get("/api/system/user/profile")) as {
        data?: UserProfile;
        error?: unknown;
      };
      if (user) {
        set({ user });
        return user;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "NotAllowedError") {
        // user cancelled browser dialog
      } else {
        console.error("[passkeyLogin] unexpected error:", e);
      }
    }
    return null;
  },
  logout() {
    client.post("/api/auth/logout");
    set({ user: null });
    onExpired();
  },
}));
```
## 3. Token Store
```typescript
import { STORAGE_KEYS } from "@/constants";

export function getAccessToken(): string | null {
  // 优先从 URL 参数中获取 token
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get("token");
  if (urlToken) {
    setAccessToken(urlToken);
    // 清除 URL 中的 token 参数
    urlParams.delete("token");
    const newUrl =
      window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : "");
    window.history.replaceState({}, "", newUrl);
    return urlToken;
  }
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
}
```
## 4. Schema (Type Safety)
```typescript
export type OpenAPIComponents = {
  schemas: never;
  responses: never;
  // parameters: {},
  // headers: {},
  requestBodies: never;
};
export type OpenAPIs = {
  get: {
    "/health": {
      query: never;
      params: never;
      headers: never;
      body: never;
      response: {};
    };
    "/health/live": {
      query: never;
      params: never;
      headers: never;
      body: never;
      response: {};
    };
    "/health/ready": {
      query: never;
      params: never;
      headers: never;
      body: never;
      response: {};
    };
    "/metrics": {
      query: never;
      params: never;
      headers: never;
      body: never;
      response: string;
    };
    /**
     * 获取公开配置
     */
    "/api/system/configs/public": {
      query: never;
      params: never;
      headers: never;
      body: never;
      response: {
        /**
         * @description 站点名称
         */
        siteName?: string;
        /**
         * @description 主题
         */
        theme?: string;
        /**
         * @description 是否启用部门
         */
        deptEnabled?: boolean;
        /**
         * @description 是否启用 MFA
         */
        mfaEnabled?: boolean;
        /**
         * @description 是否强制 MFA
         */
        mfaForce?: boolean;
        /**
         * @description 是否启用 Passkey
         */
        passkeyEnabled?: boolean;
        /**
         * @description 密码最小长度
         */
        passwordMinLength?: number;
        /**
         * @description 密码复杂度: low/medium/high
         */
        passwordComplexity?: string;
      };
    };
```
