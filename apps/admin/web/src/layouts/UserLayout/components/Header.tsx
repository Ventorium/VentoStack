import { useTheme } from "@/hooks/useTheme";
import type { ThemeMode } from "@/hooks/useTheme";
import { useAuth } from "@/store/useAuth";
import { useMenu } from "@/store/useMenu";
import {
  DesktopOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Dropdown, Layout, Space, theme } from "antd";
import { useNavigate } from "react-router";

const { Header: AntHeader } = Layout;

const themeOptions: { key: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { key: "auto", icon: <DesktopOutlined />, label: "跟随系统" },
  { key: "light", icon: <SunOutlined />, label: "亮色模式" },
  { key: "dark", icon: <MoonOutlined />, label: "暗色模式" },
];

const ThemeToggle = () => {
  const { theme: resolvedTheme, mode, setTheme } = useTheme();

  const Icon = resolvedTheme === "dark" ? MoonOutlined : SunOutlined;

  return (
    <Dropdown
      menu={{
        items: themeOptions.map((opt) => ({
          key: opt.key,
          icon: opt.icon,
          label: opt.label,
        })),
        selectedKeys: [mode],
        onClick: ({ key }) => setTheme(key as ThemeMode),
      }}
      placement="bottomRight"
    >
      <div className="text-lg cursor-pointer hover:opacity-70 transition-opacity">
        <Icon />
      </div>
    </Dropdown>
  );
};

const Header = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const collapsed = useMenu((s) => s.collapsed);
  const toggleCollapsed = useMenu((s) => s.toggleCollapsed);
  const { token } = theme.useToken();

  const onLogout = () => {
    logout();
    navigate("/auth/login", { replace: true });
  };

  const dropdownItems = {
    items: [
      { key: "profile", icon: <UserOutlined />, label: "个人信息" },
      { type: "divider" as const },
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === "logout") onLogout();
      if (key === "profile") navigate("/app/profile");
    },
  };

  return (
    <AntHeader
      className="flex items-center justify-between h-12 px-6"
      style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, lineHeight: "48px" }}
    >
      <div className="text-lg cursor-pointer" onClick={toggleCollapsed}>
        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </div>

      <Space size="middle">
        <ThemeToggle />
        <Dropdown menu={dropdownItems} placement="bottomRight">
          <Space className="cursor-pointer hover:opacity-80">
            <Avatar size={32} src={user?.avatar || undefined} icon={<UserOutlined />} />
            <span>{user?.nickname ?? user?.username ?? "用户"}</span>
          </Space>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};

export default Header;
