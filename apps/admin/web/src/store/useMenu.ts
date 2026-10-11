import { client } from "@/api";
import type { FrontendRoute } from "@/api/types";
import { create } from "zustand";

export interface MenuState {
  routes: FrontendRoute[];
  permissions: string[];
  ready: boolean;
  collapsed: boolean;
  fetchRoutes: () => Promise<void>;
  toggleCollapsed: () => void;
  hasPermission: (perm: string) => boolean;
}

/** 进行中的 fetchRoutes 请求，用于并发去重（见 fetchRoutes 内注释） */
let inflightRequest: Promise<void> | null = null;

export const useMenu = create<MenuState>((set, get) => ({
  routes: [],
  permissions: [],
  ready: false,
  collapsed: false,

  async fetchRoutes() {
    // App.tsx 与 UserLayout 都会触发本方法，React StrictMode 下 effect 还会双跑。
    // 首次请求在途时后续调用直接复用同一个 Promise，避免并发重复拉取
    // （此前 /user/routes 与 /user/permissions 每次进页面都会被请求两遍）。
    const inflight = inflightRequest;
    if (inflight) return inflight;

    inflightRequest = (async () => {
      try {
        const { data: routes, error: routesErr } = (await client.get("/api/system/user/routes")) as {
          data?: FrontendRoute[];
          error?: unknown;
        };
        const { data: permissions, error: permsErr } = (await client.get(
          "/api/system/user/permissions",
        )) as { data?: string[]; error?: unknown };
        // 只接受数组：接口异常返回非数组时保持空数组，
        // 否则下游 findLeafMenuTitle 遍历时会抛 "is not iterable"
        if (!routesErr) set({ routes: Array.isArray(routes) ? routes : [] });
        if (!permsErr) set({ permissions: Array.isArray(permissions) ? permissions : [] });
        set({ ready: true });
      } finally {
        inflightRequest = null;
      }
    })();

    return inflightRequest;
  },

  toggleCollapsed() {
    set((s) => ({ collapsed: !s.collapsed }));
  },

  hasPermission(perm: string) {
    const { permissions } = get();
    if (permissions.includes("*") || permissions.includes("admin")) return true;
    return permissions.includes(perm);
  },
}));

export function usePermission() {
  return useMenu((s) => ({ permissions: s.permissions, hasPermission: s.hasPermission }));
}
