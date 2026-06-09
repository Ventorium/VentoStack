import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useTheme } from "@/hooks/useTheme";
import { useMenu } from "@/store/useMenu";
import { resolveIcon } from "@/utils/icon";
import { Menu } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

/** 将后端路由路径补全为前端完整路径（/app 前缀） */
function normalizePath(path: string): string {
  if (path.startsWith("/app")) return path;
  return `/app${path.startsWith("/") ? "" : "/"}${path}`;
}

/** 递归构建 子菜单key → 父菜单key 的映射 */
function buildParentMap(
  routes: import("@/api/types").FrontendRoute[],
  parentKey: string | null,
  map: Map<string, string>,
): void {
  for (const r of routes) {
    if (r.meta?.hidden) continue;
    const key = normalizePath(r.path);
    if (parentKey) map.set(key, parentKey);
    if (r.children?.length) buildParentMap(r.children, key, map);
  }
}

function convertRoutesToMenuItems(routes: import("@/api/types").FrontendRoute[]): any[] {
  return routes
    .filter((r) => !r.meta?.hidden)
    .map((r) => {
      const item: any = {
        key: normalizePath(r.path),
        label: r.meta?.title ?? r.name,
        icon: (() => {
          const Icon = resolveIcon(r.meta?.icon);
          return Icon ? <Icon /> : null;
        })(),
      };
      if (r.children?.length) {
        item.children = convertRoutesToMenuItems(r.children);
      }
      return item;
    });
}

const SideMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routes = useMenu((s) => s.routes);
  const collapsed = useMenu((s) => s.collapsed);
  const { theme: resolvedTheme } = useTheme();
  const siteName = usePublicConfig((s) => s.config.siteName);

  const menuItems = useMemo(() => convertRoutesToMenuItems(routes), [routes]);
  const isDark = resolvedTheme === "dark";

  // compute selected keys from current path
  const selectedKeys = useMemo(() => {
    return [location.pathname];
  }, [location.pathname]);

  // 从路由树中找到当前路径的所有祖先菜单 key
  const routeOpenKeys = useMemo(() => {
    const parentMap = new Map<string, string>();
    buildParentMap(routes, null, parentMap);

    const keys: string[] = [];
    let current: string | undefined = location.pathname;
    while (current) {
      keys.push(current);
      current = parentMap.get(current);
    }
    return keys;
  }, [routes, location.pathname]);

  // 受控 openKeys：路由变化时自动同步，用户点击时手动更新
  const [openKeys, setOpenKeys] = useState<string[]>(routeOpenKeys);

  useEffect(() => {
    setOpenKeys(routeOpenKeys);
  }, [routeOpenKeys]);

  const onOpenChange = useCallback((keys: string[]) => {
    setOpenKeys(keys);
  }, []);

  const onClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className={`h-14 flex items-center justify-center font-semibold text-base shrink-0 ${isDark ? "text-white border-b border-white/10" : "text-white border-b border-white/10"}`}
      >
        {collapsed ? siteName.slice(0, 2) : `${siteName} 管理后台`}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Menu
          mode="inline"
          theme={isDark ? "light" : "dark"}
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={onOpenChange}
          items={menuItems}
          onClick={onClick}
          inlineCollapsed={collapsed}
        />
      </div>
    </div>
  );
};

export default SideMenu;
