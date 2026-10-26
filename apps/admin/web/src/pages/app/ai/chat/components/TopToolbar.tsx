import {
  ApiOutlined,
  ArrowLeftOutlined,
  BlockOutlined,
  BookOutlined,
  CloudServerOutlined,
  ControlOutlined,
  MessageOutlined,
  SafetyOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Checkbox,
  Empty,
  Modal,
  Space,
  Tabs,
  Tag,
  theme,
  Typography,
} from "antd";
import { useState } from "react";
import ChannelNotifyModal from "./ChannelNotifyModal";
import FunctionTabs from "./FunctionTabs";

const { Text } = Typography;

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
  /** 连接器绑定（当前用户已连接的连接器及其托管 MCP） */
  connectorBindings?: Array<{
    id: string;
    connectorKind: string;
    connectorName: string;
    status: string;
    mcpServerId: string | null;
  }>;
  enabledTools?: string[];
  enabledSkills?: string[];
  enabledMcp?: string[];
  enabledKbs?: string[];
  onToggleTool?: (tool: string, enabled: boolean) => void;
  onToggleSkill?: (id: string, enabled: boolean) => void;
  onToggleMcp?: (id: string, enabled: boolean) => void;
  onToggleKb?: (id: string, enabled: boolean) => void;
  /** 点击「去管理连接器」跳转 capabilities */
  onManageConnectors?: () => void;
  onBack?: () => void;
  /** 功能页签（对话/文件/记忆/知识库/上下文）——原在对话框上方，现由本行承载 */
  activeTab?: string;
  onTabChange?: (key: string) => void;
  canViewContext?: boolean;
  fileCount?: number;
  /** 活跃后台任务数（页签角标） */
  taskCount?: number;
  leftWidth?: number;
  /** 当前会话 ID：渠道通知设置是会话级的，必须先有会话 */
  sessionId?: string;
}

/** 单个能力的勾选列表（复用于工具/技能/MCP/知识库/连接器） */
function AbilityCheckList({
  items,
  selected,
  onToggle,
  renderItem,
  emptyText = "暂无可选能力",
}: {
  items: Array<{ id: string; name: string; description?: string | null; toolCount?: number }>;
  selected: string[];
  onToggle: (id: string, enabled: boolean) => void;
  renderItem?: (item: { id: string; name: string; description?: string | null; toolCount?: number }) => React.ReactNode;
  emptyText?: string;
}) {
  const { token } = theme.useToken();
  if (items.length === 0) {
    return <Empty description={emptyText} className="py-8" />;
  }
  return (
    <div>
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <div
            key={item.id}
            className="flex cursor-pointer items-start gap-2 rounded"
            style={{ padding: "8px 10px", background: checked ? token.colorPrimaryBg : "transparent" }}
            onClick={() => onToggle(item.id, !checked)}
          >
            <Checkbox checked={checked} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              {renderItem ? (
                renderItem(item)
              ) : (
                <>
                  <div className="text-[13px]">{item.name}</div>
                  {item.description && (
                    <Text type="secondary" className="text-[11px]">
                      {item.description}
                    </Text>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TopToolbar({
  agentName,
  agent,
  toolDescriptions,
  connectorBindings = [],
  enabledTools = [],
  enabledSkills = [],
  enabledMcp = [],
  enabledKbs = [],
  onToggleTool,
  onToggleSkill,
  onToggleMcp,
  onToggleKb,
  onManageConnectors,
  onBack,
  activeTab = "chat",
  onTabChange,
  canViewContext = false,
  fileCount = 0,
  taskCount = 0,
  leftWidth,
  sessionId,
}: TopToolbarProps) {
  const { token } = theme.useToken();
  const [capOpen, setCapOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);

  /** 连接器绑定 → 可勾选的 MCP（勾选即并入 mcpServerIds） */
  const connectorItems = connectorBindings
    .filter((b) => b.status === "connected" && b.mcpServerId)
    .map((b) => ({
      id: b.mcpServerId as string,
      name: `${b.connectorName}（连接器）`,
      description: b.connectorKind,
    }));
  const enabledConnectors = connectorItems
    .map((c) => c.id)
    .filter((id) => enabledMcp.includes(id));

  const totalEnabled =
    enabledTools.length +
    enabledSkills.length +
    enabledMcp.length +
    enabledKbs.length;

  const tabItems = [
    {
      key: "connectors",
      label: (
        <span>
          <CloudServerOutlined /> 连接器
        </span>
      ),
      children: (
        <div className="p-1">
          <AbilityCheckList
            items={connectorItems}
            selected={enabledConnectors}
            onToggle={(id, enabled) => onToggleMcp?.(id, enabled)}
            emptyText="暂无已连接的连接器"
          />
          <div className="mt-2 px-2">
            <Button type="link" size="small" onClick={onManageConnectors}>
              去管理连接器
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: "mcp",
      label: (
        <span>
          <ApiOutlined /> MCP 服务
        </span>
      ),
      children: (
        <div className="p-1">
          <AbilityCheckList
            items={agent?.mcpServers.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description,
              toolCount: m.toolCount,
            })) ?? []}
            selected={enabledMcp}
            onToggle={(id, enabled) => onToggleMcp?.(id, enabled)}
            renderItem={(item) => (
              <div>
                <Space>
                  <Text className="text-[13px]">{item.name}</Text>
                  {item.toolCount && item.toolCount > 0 && (
                    <Tag className="text-[10px]">{item.toolCount} 工具</Tag>
                  )}
                </Space>
                {item.description && (
                  <div>
                    <Text type="secondary" className="text-[11px]">
                      {item.description}
                    </Text>
                  </div>
                )}
              </div>
            )}
          />
        </div>
      ),
    },
    {
      key: "tools",
      label: (
        <span>
          <ToolOutlined /> 工具
        </span>
      ),
      children: (
        <div className="p-1">
          <AbilityCheckList
            items={agent?.tools.map((t) => ({ id: t, name: t, description: toolDescriptions?.[t] })) ?? []}
            selected={enabledTools}
            onToggle={(id, enabled) => onToggleTool?.(id, enabled)}
          />
        </div>
      ),
    },
    {
      key: "skills",
      label: (
        <span>
          <BlockOutlined /> 技能
        </span>
      ),
      children: (
        <div className="p-1">
          <AbilityCheckList
            items={agent?.skills ?? []}
            selected={enabledSkills}
            onToggle={(id, enabled) => onToggleSkill?.(id, enabled)}
          />
        </div>
      ),
    },
    {
      key: "kbs",
      label: (
        <span>
          <BookOutlined /> 知识库
        </span>
      ),
      children: (
        <div className="p-1">
          <div className="px-2 pb-1 text-[11px]" style={{ color: token.colorTextSecondary }}>
            从智能体绑定的知识库中选取（会话勾选仅缩小范围）
          </div>
          <AbilityCheckList
            items={agent?.knowledgeBases ?? []}
            selected={enabledKbs}
            onToggle={(id, enabled) => onToggleKb?.(id, enabled)}
          />
        </div>
      ),
    },
  ];

  return (
    <div
      className="flex items-center gap-6"
      style={{ padding: "8px 16px 8px 0", borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
    >
      {/* Left: Back + Agent Info */}
      <div
        className="flex min-w-0 shrink-0 items-center gap-2 pl-2"
        style={leftWidth === undefined ? undefined : { width: leftWidth }}
      >
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} size="small" title="返回智能体列表" />
        <Avatar
          size={32}
          className="shrink-0 text-xs font-semibold"
          style={{ background: token.colorPrimary, borderRadius: token.borderRadiusSM }}
        >
          {agentName.slice(0, 2)}
        </Avatar>
        <Text strong className="block max-w-[180px] min-w-0 flex-1 truncate text-sm" title={agentName}>
          {agentName}
        </Text>
      </div>

      {/* Middle: Function Tabs */}
      <FunctionTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        canViewContext={canViewContext}
        fileCount={fileCount}
        taskCount={taskCount}
        className="min-w-0 flex-1"
      />

      {/* Right: 能力配置（合并原工具/技能/MCP/知识库四入口） */}
      {agent && (
        <Space size={6} className="shrink-0">
          <Button
            size="small"
            icon={<MessageOutlined />}
            className="text-xs"
            style={{ borderRadius: token.borderRadiusLG }}
            onClick={() => setNotifyOpen(true)}
            title="把任务结果推送到微信 / QQ 等渠道"
          >
            渠道通知
          </Button>

          <Button
            size="small"
            icon={<SettingOutlined />}
            className="text-xs"
            style={{ borderRadius: token.borderRadiusLG }}
            onClick={() => setCapOpen(true)}
          >
            能力配置{totalEnabled > 0 ? ` (${totalEnabled})` : ""}
          </Button>

          {agent.requiresVirtualEnvironment && (
            <Tag
              icon={<SafetyOutlined />}
              color="success"
              className="ml-2"
              style={{ borderRadius: token.borderRadiusSM }}
            >
              虚拟环境
            </Tag>
          )}
        </Space>
      )}

      <Modal
        title={
          <Space>
            <ControlOutlined />
            <span>能力配置</span>
          </Space>
        }
        open={capOpen}
        onCancel={() => setCapOpen(false)}
        footer={null}
        width={560}
        destroyOnClose
      >
        <Tabs
          defaultActiveKey="connectors"
          tabPosition="left"
          items={tabItems}
          className="capability-tabs"
        />
      </Modal>

      <ChannelNotifyModal
        open={notifyOpen}
        sessionId={sessionId}
        onClose={() => setNotifyOpen(false)}
      />
    </div>
  );
}
