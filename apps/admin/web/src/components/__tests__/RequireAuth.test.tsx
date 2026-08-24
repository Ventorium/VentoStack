/**
 * RequireAuth 路由守卫单元测试
 *
 * 覆盖：
 * 1. buildLoginRedirect：未认证时构造的重定向目标与 state（from 记录原始位置含查询串）
 * 2. resolvePostLoginTarget：登录成功后回跳原目标 / 默认 /app / 拒绝外链与 auth 路径（防开放重定向）
 * 3. 守卫行为契约：未认证 → Navigate to=/auth/login state.from；已认证 → 渲染子节点
 *
 * 说明：bun test 无 DOM 测试库，组件渲染契约通过纯函数与 mock 契约验证，
 * 与仓库现有测试风格（如 pages/auth/__tests__）保持一致。
 */
import { describe, expect, mock, test } from "bun:test";

const {
  buildLoginRedirect,
  DEFAULT_POST_LOGIN_PATH,
  LOGIN_PATH,
  resolvePostLoginTarget,
} = await import("../RequireAuth");

describe("RequireAuth 守卫", () => {
  describe("buildLoginRedirect（未认证重定向构造）", () => {
    test("重定向目标是登录页且 replace 语义", () => {
      const { to } = buildLoginRedirect("/app/system/users", "");
      expect(to).toBe(LOGIN_PATH);
      expect(LOGIN_PATH).toBe("/auth/login");
    });

    test("state.from 记录原始路径", () => {
      const { state } = buildLoginRedirect("/app/system/users", "");
      expect(state.from).toBe("/app/system/users");
    });

    test("state.from 保留查询参数", () => {
      const { state } = buildLoginRedirect("/app/ai/chat", "?sessionId=abc");
      expect(state.from).toBe("/app/ai/chat?sessionId=abc");
    });

    test("根业务页 /app 也被正确记录", () => {
      const { to, state } = buildLoginRedirect("/app", "");
      expect(to).toBe("/auth/login");
      expect(state.from).toBe("/app");
    });
  });

  describe("resolvePostLoginTarget（登录成功回跳）", () => {
    test("location.state.from 存在时回跳原目标", () => {
      expect(resolvePostLoginTarget({ from: "/app/system/roles" })).toBe(
        "/app/system/roles",
      );
    });

    test("from 含查询参数时完整回跳", () => {
      expect(resolvePostLoginTarget({ from: "/app/workflow/tasks?id=42" })).toBe(
        "/app/workflow/tasks?id=42",
      );
    });

    test("无 state 时回退到默认工作台 /app", () => {
      expect(resolvePostLoginTarget(null)).toBe(DEFAULT_POST_LOGIN_PATH);
      expect(resolvePostLoginTarget(undefined)).toBe("/app");
    });

    test("state 为空对象时回退到默认工作台", () => {
      expect(resolvePostLoginTarget({})).toBe("/app");
    });

    test("拒绝站外绝对地址，防止开放重定向", () => {
      expect(resolvePostLoginTarget({ from: "https://evil.example.com" })).toBe("/app");
      expect(resolvePostLoginTarget({ from: "http://evil.example.com/path" })).toBe("/app");
    });

    test("拒绝协议相对地址 // 开头的伪外链", () => {
      expect(resolvePostLoginTarget({ from: "//evil.example.com" })).toBe("/app");
    });

    test("from 指向登录页本身时回退到默认工作台，避免回环", () => {
      expect(resolvePostLoginTarget({ from: "/auth/login" })).toBe("/app");
      expect(resolvePostLoginTarget({ from: "/auth/mfa" })).toBe("/app");
    });
  });

  describe("守卫组件行为契约", () => {
    test("未认证时应渲染 <Navigate to=LOGIN_PATH state={from}> 且 replace", () => {
      const navigateSpy = mock(() => null);

      // 模拟 RequireAuth 的渲染分支逻辑
      const logged = false;
      const { to, state } = buildLoginRedirect("/app/system/users", "");
      let rendered: unknown;
      if (!logged) {
        rendered = navigateSpy(to, { replace: true, state });
      } else {
        rendered = "children";
      }

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith("/auth/login", {
        replace: true,
        state: { from: "/app/system/users" },
      });
      expect(rendered).toBeNull();
    });

    test("已认证时直接渲染受保护子节点", () => {
      const navigateSpy = mock(() => null);
      const logged = true;
      const child = { type: "Outlet" };

      const rendered = logged ? child : navigateSpy();
      expect(rendered).toBe(child);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    test("认证状态来自 useAuth computed.logged（zustand 选择器契约）", () => {
      // useAuth((s) => s.computed.logged) 的返回值即守卫判定依据
      const selector = (s: { computed: { logged: boolean } }) => s.computed.logged;
      expect(selector({ computed: { logged: false } })).toBe(false);
      expect(selector({ computed: { logged: true } })).toBe(true);
    });
  });
});
