import { useTheme } from "@/hooks/useTheme";
import { useMenu } from "@/store/useMenu";
import { Layout, theme } from "antd";
import { type ReactNode, useEffect } from "react";
import Header from "./components/Header";
import SideMenu from "./components/SideMenu";

const { Sider, Content } = Layout;

interface UserLayoutProps {
  children: ReactNode;
}

const UserLayout = ({ children }: UserLayoutProps) => {
  const collapsed = useMenu((s) => s.collapsed);
  const fetchRoutes = useMenu((s) => s.fetchRoutes);
  const menuReady = useMenu((s) => s.ready);
  const { theme: resolvedTheme } = useTheme();
  const { token } = theme.useToken();

  useEffect(() => {
    if (!menuReady) {
      fetchRoutes();
    }
  }, [menuReady, fetchRoutes]);

  const isDark = resolvedTheme === "dark";
  const siderBg = isDark ? token.colorBgContainer : "#001529";
  const contentBg = isDark ? token.colorBgElevated : "#f5f5f5";

  return (
    <Layout className="h-screen w-screen overflow-hidden">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        collapsedWidth={64}
        className="overflow-hidden"
        style={{
          background: siderBg,
          borderRight: isDark
            ? `1px solid ${token.colorBorderSecondary}`
            : "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <SideMenu />
      </Sider>
      <Layout>
        <Header />
        <Content className="overflow-auto p-6" style={{ background: contentBg }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default UserLayout;
