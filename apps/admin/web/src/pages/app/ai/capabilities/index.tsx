/**
 * AI 智能能力管理页面
 * Tabs: 技能 (Skills) | 专家 (Experts) | MCP 服务 | 工具 (Tools)
 *
 * 各 Tab 的实现拆到 ./components/ 下独立维护。
 */
import {
  ApiOutlined,
  BlockOutlined,
  CloudServerOutlined,
  HddOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Card, Space, Tabs } from 'antd';
import ConnectorsTab from './components/connectors-tab';
import RuntimeTab from './components/runtime-tab';
import ExpertsTab from './components/experts-tab';
import McpTab from './components/mcp-tab';
import SkillsTab from './components/skills-tab';
import ToolsTab from './components/tools-tab';

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
        defaultActiveKey="connectors"
        items={[
          {
            key: 'connectors',
            label: (
              <span>
                <CloudServerOutlined /> 连接器 Connectors
              </span>
            ),
            children: <ConnectorsTab />,
          },
          {
            key: 'runtime',
            label: (
              <span>
                <HddOutlined /> 虚拟机接入
              </span>
            ),
            children: <RuntimeTab />,
          },
          {
            key: 'skills',
            label: (
              <span>
                <BlockOutlined /> 技能 Skills
              </span>
            ),
            children: <SkillsTab />,
          },
          {
            key: 'experts',
            label: (
              <span>
                <TeamOutlined /> 专家 Experts
              </span>
            ),
            children: <ExpertsTab />,
          },
          {
            key: 'mcp',
            label: (
              <span>
                <ApiOutlined /> MCP 服务
              </span>
            ),
            children: <McpTab />,
          },
          {
            key: 'tools',
            label: (
              <span>
                <ToolOutlined /> 工具 Tools
              </span>
            ),
            children: <ToolsTab />,
          },
        ]}
      />
    </Card>
  );
}
