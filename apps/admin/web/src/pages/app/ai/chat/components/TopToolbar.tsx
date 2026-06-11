import {
  ApiOutlined,
  CodeOutlined,
  ControlOutlined,
  SafetyOutlined,
  SettingOutlined,
  TeamOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Space, Tag, theme, Tooltip, Typography } from "antd";

const { Text } = Typography;

interface ToolbarButton {
  key: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
}

interface TopToolbarProps {
  agentName?: string;
  onOpenSkills?: () => void;
  onOpenSettings?: () => void;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { key: "team", icon: <TeamOutlined />, label: "团队", count: 3 },
  { key: "skills", icon: <ControlOutlined />, label: "技能", count: 1 },
  { key: "cli", icon: <CodeOutlined />, label: "CLI", count: 3 },
  { key: "mcp", icon: <ApiOutlined />, label: "MCP" },
  { key: "tools", icon: <ToolOutlined />, label: "工具", count: 3 },
  { key: "settings", icon: <SettingOutlined />, label: "设置" },
];

export default function TopToolbar({ agentName = "新助手", onOpenSkills, onOpenSettings }: TopToolbarProps) {
  const { token } = theme.useToken();

  const handleClick = (key: string) => {
    if (key === "skills") onOpenSkills?.();
    if (key === "settings") onOpenSettings?.();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      {/* Left: Agent Info */}
      <Space size={10}>
        <Avatar
          size={32}
          style={{
            background: token.colorPrimary,
            borderRadius: token.borderRadiusSM,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {agentName.slice(0, 2)}
        </Avatar>
        <Text strong style={{ fontSize: 14 }}>
          {agentName}
        </Text>
      </Space>

      {/* Right: Toolbar Buttons */}
      <Space size={6}>
        {TOOLBAR_BUTTONS.map((btn) => (
          <Tooltip key={btn.key} title={btn.label}>
            <Badge size="small" count={btn.count} offset={[-4, 0]}>
              <Button
                size="small"
                icon={btn.icon}
                onClick={() => handleClick(btn.key)}
                style={{
                  borderRadius: token.borderRadiusLG,
                  fontSize: 12,
                }}
              >
                {btn.label}
              </Button>
            </Badge>
          </Tooltip>
        ))}

        <Tag
          icon={<SafetyOutlined />}
          color="success"
          style={{ marginLeft: 8, borderRadius: token.borderRadiusSM }}
        >
          沙箱
        </Tag>
      </Space>
    </div>
  );
}
