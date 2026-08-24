import { useAuth } from "@/store/useAuth";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/** 登录页 location.state 载荷：记录被守卫拦截时的原始目标，登录成功后回跳 */
export interface LoginLocationState {
  from?: string;
}

/** 登录页路径（公开路由） */
export const LOGIN_PATH = "/auth/login";

/** 默认登录后的落地页 */
export const DEFAULT_POST_LOGIN_PATH = "/app";

/**
 * 构造重定向到登录页的目标与 state（纯函数，便于单元测试）。
 * 未认证访问受保护路由时使用。
 */
export const buildLoginRedirect = (
  pathname: string,
  search: string,
): { to: string; state: LoginLocationState } => {
  return { to: LOGIN_PATH, state: { from: `${pathname}${search}` } };
};

/**
 * 计算登录成功后的回跳目标（纯函数，便于单元测试）。
 * 仅接受站内非 auth 页路径，防止开放重定向；其余情况回到默认工作台。
 */
export const resolvePostLoginTarget = (state: unknown): string => {
  const from = (state as LoginLocationState | null)?.from;
  if (
    from &&
    from.startsWith("/") &&
    !from.startsWith("//") &&
    !from.startsWith("/auth")
  ) {
    return from;
  }
  return DEFAULT_POST_LOGIN_PATH;
};

/**
 * 路由守卫：未认证时重定向到登录页，并通过 location.state 记录原始目标。
 * 仅包裹业务路由（/app/**），登录页等公开路由不包裹。
 */
const RequireAuth = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const logged = useAuth((s) => s.computed.logged);

  if (!logged) {
    const { to, state } = buildLoginRedirect(location.pathname, location.search);
    return <Navigate to={to} replace state={state} />;
  }

  return <>{children}</>;
};

export default RequireAuth;
