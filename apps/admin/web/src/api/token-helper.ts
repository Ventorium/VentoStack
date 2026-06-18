/**
 * 共享 Token 刷新工具
 *
 * api/index.ts 和 sse-client.ts 共用同一套 token 刷新逻辑，
 * 避免重复实现。
 */
import {
  clearToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/store/token";

let isRefreshing = false;
let pendingToken: Promise<string | null> | null = null;

/**
 * 获取有效的 access token。
 * 若 access token 不存在但 refresh token 存在，则自动刷新。
 * 多个调用者并发时共享同一次刷新请求。
 */
export async function getValidToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token) return token;

  if (!pendingToken) {
    pendingToken = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;

      isRefreshing = true;
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        const json = await res.json();
        const data = json?.data ?? json;
        if (res.ok && data?.accessToken) {
          setAccessToken(data.accessToken);
          if (data.refreshToken) setRefreshToken(data.refreshToken);
          return data.accessToken as string;
        }
        return null;
      } catch {
        return null;
      } finally {
        isRefreshing = false;
        pendingToken = null;
      }
    })();
  }

  return pendingToken;
}

/**
 * 标记当前 token 无效并清除。
 * 用于刷新失败后的降级处理。
 */
export function invalidateToken(): void {
  clearToken();
}
