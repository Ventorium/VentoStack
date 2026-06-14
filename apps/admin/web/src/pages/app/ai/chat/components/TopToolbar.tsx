import {
  ApiOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  BookOutlined,
  ControlOutlined,
  SafetyOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Avatar, Badge, Button, Checkbox, Popover, Space, Tag, theme, Typography } from "antd";

const { Text } = Typography;

interface AgentAbility {
  id: string;
  name: string;
  description?: string | null;
  toolCount?: number;
}

interface TopToolbarProps {
  agentName: string;
  agent?: {
    tools: string[];
    skills: Array<{ id: string; name: string; description: string | null }>;
    mcpServers: Array<{ id: string; name: string; description: string | null; toolCount: number }>;
    knowledgeBases: Array<{ id: string; name: string; description: string | null }>;
  };
  enabledTools?: string[];
  enabledSkills?: string[];
  enabledMcp?: string[];
  enabledKbs?: string[];
  onToggleTool?: (tool: string, enabled: boolean) => void;
  onToggleSkill?: (id: string, enabled: boolean) => void;
  onToggleMcp?: (id: string, enabled: boolean) => void;
  onToggleKb?: (id: string, enabled: boolean) => void;
  onBack?: () => void;
}

function AbilityPopover({
  title, icon, items, selected, onToggle, renderItem,
}: {
  title: string; icon: React.ReactNode;
  items: Array<{ id: string; name: string; description?: string | null; toolCount?: number }>;
  selected: string[];
  onToggle: (id: string, enabled: boolean) => void;
  renderItem?: (item: { id: string; name: string; description?: string | null; toolCount?: number }) => React.ReactNode;
}) {
  const { token } = theme.useToken();

  return (
    <div style={{ width: 280, maxHeight: 320, overflow: "auto" }}>
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}`, fontWeight: 500 }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: token.colorTextSecondary }}>暂无</div>
      ) : (
        <div style={{ padding: 4 }}>
          {items.map(item => {
            const checked = selected.includes(item.id);
            return (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px",
                  borderRadius: 4, cursor: "pointer",
                  background: checked ? token.colorPrimaryBg : "transparent",
                }}
                onClick={() => onToggle(item.id, !checked)}
              >
                <Checkbox checked={checked} style={{ marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renderItem ? renderItem(item) : (
                    <>
                      <div style={{ fontSize: 13 }}>{item.name}</div>
                      {item.description && <Text type="secondary" style={{ fontSize: 11 }}>{item.description}</Text>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TopToolbar({
  agentName, agent, enabledTools = [], enabledSkills = [], enabledMcp = [], enabledKbs = [],
  onToggleTool, onToggleSkill, onToggleMcp, onToggleKb, onBack,
}: TopToolbarProps) {
  const { token } = theme.useToken();

  const totalEnabled = enabledTools.length + enabledSkills.length + enabledMcp.length + enabledKbs.length;

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
      {/* Left: Back + Agent Info */}
      <Space size={10}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} size="small" />
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
        <Tag color="success" style={{ borderRadius: token.borderRadiusSM }}>
          {totalEnabled} 能力已启用
        </Tag>
      </Space>

      {/* Right: Ability Toggles */}
      {agent && (
        <Space size={6}>
          {/* Tools */}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <AbilityPopover
                title="工具" icon={<ToolOutlined />}
                items={agent.tools.map(t => ({ id: t, name: t }))}
                selected={enabledTools}
                onToggle={(id, enabled) => onToggleTool?.(id, enabled)}
              />
            }
          >
            <Badge size="small" count={enabledTools.length} offset={[-4, 0]}>
              <Button size="small" icon={<ToolOutlined />} style={{ borderRadius: token.borderRadiusLG, fontSize: 12 }}>
                工具
              </Button>
            </Badge>
          </Popover>

          {/* Skills */}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <AbilityPopover
                title="技能" icon={<BlockOutlined />}
                items={agent.skills}
                selected={enabledSkills}
                onToggle={(id, enabled) => onToggleSkill?.(id, enabled)}
              />
            }
          >
            <Badge size="small" count={enabledSkills.length} offset={[-4, 0]}>
              <Button size="small" icon={<BlockOutlined />} style={{ borderRadius: token.borderRadiusLG, fontSize: 12 }}>
                技能
              </Button>
            </Badge>
          </Popover>

          {/* MCP */}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <AbilityPopover
                title="MCP 服务" icon={<ApiOutlined />}
                items={agent.mcpServers.map(m => ({ id: m.id, name: m.name, description: m.description, toolCount: m.toolCount }))}
                selected={enabledMcp}
                onToggle={(id, enabled) => onToggleMcp?.(id, enabled)}
                renderItem={item => (
                  <div>
                    <Space>
                      <Text style={{ fontSize: 13 }}>{item.name}</Text>
                      {item.toolCount && item.toolCount > 0 && <Tag style={{ fontSize: 10 }}>{item.toolCount} 工具</Tag>}
                    </Space>
                    {item.description && <div><Text type="secondary" style={{ fontSize: 11 }}>{item.description}</Text></div>}
                  </div>
                )}
              />
            }
          >
            <Badge size="small" count={enabledMcp.length} offset={[-4, 0]}>
              <Button size="small" icon={<ApiOutlined />} style={{ borderRadius: token.borderRadiusLG, fontSize: 12 }}>
                MCP
              </Button>
            </Badge>
          </Popover>

          {/* Knowledge Bases */}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <AbilityPopover
                title="知识库" icon={<BookOutlined />}
                items={agent.knowledgeBases}
                selected={enabledKbs}
                onToggle={(id, enabled) => onToggleKb?.(id, enabled)}
              />
            }
          >
            <Badge size="small" count={enabledKbs.length} offset={[-4, 0]}>
              <Button size="small" icon={<BookOutlined />} style={{ borderRadius: token.borderRadiusLG, fontSize: 12 }}>
                知识库
              </Button>
            </Badge>
          </Popover>

          <Tag
            icon={<SafetyOutlined />}
            color="success"
            style={{ marginLeft: 8, borderRadius: token.borderRadiusSM }}
          >
            沙箱
          </Tag>
        </Space>
      )}
    </div>
  );
}
