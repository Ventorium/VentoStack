import {
  ApiOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  BookOutlined,
  ControlOutlined,
  SafetyOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Checkbox, Popover, Space, Tag, theme, Typography } from "antd";
import FunctionTabs from "./FunctionTabs";

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
    requiresVirtualEnvironment: boolean;
    tools: string[];
    skills: Array<{ id: string; name: string; description: string | null }>;
    mcpServers: Array<{ id: string; name: string; description: string | null; toolCount: number }>;
    knowledgeBases: Array<{ id: string; name: string; description: string | null }>;
  };
  /** 工具名称 → 说明（来自 /api/ai/tools 注册表） */
  toolDescriptions?: Record<string, string>;
  enabledTools?: string[];
  enabledSkills?: string[];
  enabledMcp?: string[];
  enabledKbs?: string[];
  onToggleTool?: (tool: string, enabled: boolean) => void;
  onToggleSkill?: (id: string, enabled: boolean) => void;
  onToggleMcp?: (id: string, enabled: boolean) => void;
  onToggleKb?: (id: string, enabled: boolean) => void;
  onBack?: () => void;
  /** 功能页签（对话/文件/记忆/知识库/上下文）——原在对话框上方，现由本行承载 */
  activeTab?: string;
  onTabChange?: (key: string) => void;
  canViewContext?: boolean;
  fileCount?: number;
}

function AbilityPopover({
  title, icon, items, selected, onToggle, renderItem, width = 280,
}: {
  title: string; icon: React.ReactNode;
  items: Array<{ id: string; name: string; description?: string | null; toolCount?: number }>;
  selected: string[];
  onToggle: (id: string, enabled: boolean) => void;
  renderItem?: (item: { id: string; name: string; description?: string | null; toolCount?: number }) => React.ReactNode;
  width?: number;
}) {
  const { token } = theme.useToken();

  return (
    <div className="max-h-[320px] overflow-auto" style={{ width }}>
      <div className="font-medium" style={{ padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div className="p-4 text-center" style={{ color: token.colorTextSecondary }}>暂无</div>
      ) : (
        <div className="p-1">
          {items.map(item => {
            const checked = selected.includes(item.id);
            return (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded cursor-pointer" style={{ padding: "6px 8px", background: checked ? token.colorPrimaryBg : "transparent" }}
                onClick={() => onToggle(item.id, !checked)}
              >
                <Checkbox checked={checked} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  {renderItem ? renderItem(item) : (
                    <>
                      <div className="text-[13px]">{item.name}</div>
                      {item.description && <Text type="secondary" className="text-[11px]">{item.description}</Text>}
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
  agentName, agent, toolDescriptions, enabledTools = [], enabledSkills = [], enabledMcp = [], enabledKbs = [],
  onToggleTool, onToggleSkill, onToggleMcp, onToggleKb, onBack,
  activeTab = "chat", onTabChange, canViewContext = false, fileCount = 0,
}: TopToolbarProps) {
  const { token } = theme.useToken();

  return (
    <div
      className="flex items-center gap-4" style={{ padding: "8px 16px", borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
    >
      {/* Left: Back + Agent Info（标题限宽省略，右侧留 16px 与页签分隔） */}
      <div className="flex min-w-0 shrink-0 items-center gap-2 pr-4">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} size="small" title="返回智能体列表" />
        <Avatar
          size={32}
          className="shrink-0 text-xs font-semibold" style={{ background: token.colorPrimary, borderRadius: token.borderRadiusSM }}
        >
          {agentName.slice(0, 2)}
        </Avatar>
        <Text strong className="block max-w-[180px] truncate text-sm" title={agentName}>
          {agentName}
        </Text>
      </div>

      {/* Middle: Function Tabs */}
      <FunctionTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        canViewContext={canViewContext}
        fileCount={fileCount}
        className="min-w-0 flex-1"
      />

      {/* Right: Ability Toggles */}
      {agent && (
        <Space size={6} className="shrink-0">
          {/* Tools */}
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <AbilityPopover
                title="工具" icon={<ToolOutlined />} width={380}
                items={agent.tools.map(t => ({ id: t, name: t, description: toolDescriptions?.[t] }))}
                selected={enabledTools}
                onToggle={(id, enabled) => onToggleTool?.(id, enabled)}
              />
            }
          >
            <Button size="small" icon={<ToolOutlined />} className="text-xs" style={{ borderRadius: token.borderRadiusLG }}>
              工具{enabledTools.length > 0 ? ` (${enabledTools.length})` : ""}
            </Button>
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
            <Button size="small" icon={<BlockOutlined />} className="text-xs" style={{ borderRadius: token.borderRadiusLG }}>
              技能{enabledSkills.length > 0 ? ` (${enabledSkills.length})` : ""}
            </Button>
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
                      <Text className="text-[13px]">{item.name}</Text>
                      {item.toolCount && item.toolCount > 0 && <Tag className="text-[10px]">{item.toolCount} 工具</Tag>}
                    </Space>
                    {item.description && <div><Text type="secondary" className="text-[11px]">{item.description}</Text></div>}
                  </div>
                )}
              />
            }
          >
            <Button size="small" icon={<ApiOutlined />} className="text-xs" style={{ borderRadius: token.borderRadiusLG }}>
              MCP{enabledMcp.length > 0 ? ` (${enabledMcp.length})` : ""}
            </Button>
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
            <Button size="small" icon={<BookOutlined />} className="text-xs" style={{ borderRadius: token.borderRadiusLG }}>
              知识库{enabledKbs.length > 0 ? ` (${enabledKbs.length})` : ""}
            </Button>
          </Popover>

          {agent.requiresVirtualEnvironment && (
            <Tag
              icon={<SafetyOutlined />}
              color="success"
              className="ml-2" style={{ borderRadius: token.borderRadiusSM }}
            >
              虚拟环境
            </Tag>
          )}
        </Space>
      )}
    </div>
  );
}
