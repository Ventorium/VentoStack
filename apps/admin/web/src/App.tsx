import GlobalHistory from "@/components/GlobalHistory";
import GlobalMessage from "@/components/GlobalMessage";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/store/useAuth";
import { useMenu } from "@/store/useMenu";
import type { FrontendRoute } from "@/api/types";
import { AppTheme } from "@/theme";
import { App as AntApp, ConfigProvider, Spin, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useRoutes } from "react-router";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import routes from "~react-pages";

console.log("routes", routes);

/** 从菜单树中递归查找路径匹配的叶子菜单标题 */
function findLeafMenuTitle(routes: FrontendRoute[], pathname: string): string | null {
  // 收集所有叶子路由的 (path, title) 做前缀匹配
  const leaves: Array<{ path: string; title: string }> = [];
  function collect(rs: FrontendRoute[]): void {
    for (const r of rs) {
      const fullPath = r.path.startsWith("/app") ? r.path : `/app${r.path.startsWith("/") ? "" : "/"}${r.path}`;
      if (r.children?.length) {
        collect(r.children);
      } else {
        leaves.push({ path: fullPath, title: r.meta?.title ?? r.name });
      }
    }
  }
  collect(routes);

  // 精确匹配优先
  const exact = leaves.find((l) => l.path === pathname);
  if (exact) return exact.title;

  // 最长前缀匹配（支持动态路由如 /app/ai/knowledge-bases/:id）
  const best = leaves
    .filter((l) => pathname.startsWith(l.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];

  return best?.title ?? null;
}

const AppRoutes = () => {
  return <Suspense fallback={<Spin size="large" fullscreen />}>{useRoutes(routes)}</Suspense>;
};

const _App = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    ready: authReady,
    computed: { logged },
  } = useAuth();
  const fetchRoutes = useMenu((s) => s.fetchRoutes);
  const menuReady = useMenu((s) => s.ready);
  const menuRoutes = useMenu((s) => s.routes);
  const siteName = usePublicConfig((s) => s.config.siteName);

  useEffect(() => {
    if (authReady) {
      if (logged) {
        // fetch menus when logged in and not already fetched
        fetchRoutes();
      } else if (pathname !== "/auth/login") {
        navigate("/auth/login", { replace: true });
      }
    }
  }, [authReady, logged, pathname, navigate, fetchRoutes]);

  // 动态更新 document.title：系统名称 - 当前菜单标题
  useEffect(() => {
    const menuTitle = menuReady ? findLeafMenuTitle(menuRoutes, pathname) : null;
    if (menuTitle) {
      document.title = `${siteName} - ${menuTitle}`;
    } else {
      document.title = `${siteName} 管理后台`;
    }
  }, [siteName, pathname, menuRoutes, menuReady]);

  // show loading while auth is initializing or menus loading
  if (!authReady || (logged && !menuReady && pathname.startsWith("/app"))) {
    return <Spin size="large" fullscreen />;
  }

  return <AppRoutes />;
};

function App() {
  const { init: initAuth } = useAuth();
  const { fetch: fetchPublicConfig } = usePublicConfig();
  const { theme: userTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([initAuth(), fetchPublicConfig()])
      .catch(() => {})
      .then(() => {
        setReady(true);
      });
  }, []);

  const algorithm =
    userTheme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;

  return (
    <BrowserRouter>
      <GlobalHistory />
      <GlobalMessage />
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm,
          token: {
            colorPrimary: AppTheme.primaryColor,
          },
        }}
      >
        <AntApp>{ready ? <_App /> : <Spin size="large" fullscreen />}</AntApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
