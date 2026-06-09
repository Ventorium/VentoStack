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
  for (const r of routes) {
    // 补全路径前缀
    const fullPath = r.path.startsWith("/app") ? r.path : `/app${r.path.startsWith("/") ? "" : "/"}${r.path}`;
    if (r.children?.length) {
      const child = findLeafMenuTitle(r.children, pathname);
      if (child) return child;
    }
    if (fullPath === pathname) {
      return r.meta?.title ?? r.name;
    }
  }
  return null;
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
