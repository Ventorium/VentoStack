/**
 * AI 智能能力管理页面
 * Tabs: 技能 (Skills) | MCP 服务 | 工具 (Tools)
 *
 * 各 Tab 的实现拆到 ./components/ 下独立维护。
 */
import {
  ApiOutlined,
  BlockOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Card, Space, Tabs } from "antd";
import McpTab from "./components/mcp-tab";
import SkillsTab from "./components/skills-tab";
import ToolsTab from "./components/tools-tab";

export default function AICapabilitiesPage() {
  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined />
          <span>AI 智能能力</span>
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="skills"
        items={[
          {
            key: "skills",
            label: <span><BlockOutlined /> 技能 Skills</span>,
            children: <SkillsTab />,
          },
          {
            key: "mcp",
            label: <span><ApiOutlined /> MCP 服务</span>,
            children: <McpTab />,
          },
          {
            key: "tools",
            label: <span><ToolOutlined /> 工具 Tools</span>,
            children: <ToolsTab />,
          },
        ]}
      />
    </Card>
  );
}