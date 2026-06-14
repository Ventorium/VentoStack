import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Checkbox, Col, Empty, Form, Input, Row, Select, Space, Switch, Tabs, Tag, Typography, message, theme,
} from "antd";
import {
  ApartmentOutlined, ArrowLeftOutlined, BlockOutlined, BookOutlined, CodeOutlined,
  FileOutlined, FolderOutlined, FunctionOutlined, MessageOutlined, RobotOutlined, SaveOutlined,
  ThunderboltOutlined, ToolOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/api";
import type { AgentItem, SkillItem, McpServerItem, AIToolItem } from "@/api/types";

const { TextArea } = Input;
const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  active: { label: "已发布", color: "green" },
  disabled: { label: "已停用", color: "red" },
};

// ── 能力选择面板组件 ──

function AbilityPanel({
  title, icon, items, selected, onChange, renderItem,
}: {
  title: string; icon: React.ReactNode;
  items: Array<{ id: string; name: string; description?: string | null; disabled?: boolean }>;
  selected: string[]; onChange: (ids: string[]) => void;
  renderItem?: (item: { id: string; name: string; description?: string | null; disabled?: boolean }) => React.ReactNode;
}) {
  const { token } = theme.useToken();
  const allIds = items.filter(i => !i.disabled).map(i => i.id);
  const allChecked = allIds.length > 0 && allIds.every(id => selected.includes(id));
  const indeterminate = selected.length > 0 && !allChecked;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Space>
          {icon}
          <Text strong>{title}</Text>
          <Tag>{selected.length}/{items.length}</Tag>
        </Space>
        <Checkbox
          indeterminate={indeterminate}
          checked={allChecked}
          onChange={e => onChange(e.target.checked ? allIds : [])}
        >全选</Checkbox>
      </div>
      {items.length === 0 ? (
        <Empty description={`暂无${title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {items.map(item => {
            const checked = selected.includes(item.id);
            return (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
                  borderRadius: 6, marginBottom: 4, cursor: item.disabled ? "not-allowed" : "pointer",
                  background: checked ? token.colorPrimaryBg : "transparent",
                  border: `1px solid ${checked ? token.colorPrimaryBorder : "transparent"}`,
                  opacity: item.disabled ? 0.5 : 1,
                }}
                onClick={() => {
                  if (item.disabled) return;
                  onChange(checked ? selected.filter(id => id !== item.id) : [...selected, item.id]);
                }}
              >
                <Checkbox checked={checked} disabled={item.disabled} style={{ marginTop: 2 }}
                  onChange={e => {
                    if (item.disabled) return;
                    onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id));
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renderItem ? renderItem(item) : (
                    <>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                      {item.description && <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>}
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

// ── 主页面 ──

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<AgentItem | null>(null);

  // 能力数据
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; options: Array<{ label: string; value: string }> }>>([]);
  const [tools, setTools] = useState<Array<{ id: string; name: string; description: string; riskLevel: string }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string | null; enabled: boolean }>>([]);
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }>>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  // 选中的能力 ID
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<string[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<string[]>([]);

  // 加载能力选项
  useEffect(() => {
    client.get("/api/ai/models").then(({ data }) => {
      const models = data as Array<{ modelId: string; displayName: string | null; providerName: string }> | undefined;
      if (models?.length) {
        const groupMap = new Map<string, Array<{ label: string; value: string }>>();
        for (const m of models) {
          const group = m.providerName || "其他";
          if (!groupMap.has(group)) groupMap.set(group, []);
          groupMap.get(group)!.push({ label: m.displayName || m.modelId, value: m.modelId });
        }
        setModelOptions(Array.from(groupMap.entries()).map(([label, options]) => ({ label, options })));
      }
    }).catch(() => {});

    client.get("/api/ai/tools").then(({ data }) => {
      const list = data as AIToolItem[] | undefined;
      if (list?.length) setTools(list.map(t => ({ id: t.name, name: t.name, description: t.description, riskLevel: t.riskLevel })));
    }).catch(() => {});

    client.get("/api/ai/skills", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: SkillItem[] })?.list;
      if (list?.length) setSkills(list.map(s => ({ id: s.id, name: s.name, description: s.description, enabled: s.enabled })));
    }).catch(() => {});

    client.get("/api/ai/mcp-servers", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: McpServerItem[] })?.list;
      if (list?.length) setMcpServers(list.map(m => ({ id: m.id, name: m.name, description: m.description, status: m.status, toolCount: m.toolCount })));
    }).catch(() => {});

    client.get("/api/ai/knowledge-bases", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null }> })?.list;
      if (list?.length) setKnowledgeBases(list.map(k => ({ id: k.id, name: k.name, description: k.description })));
    }).catch(() => {});
  }, []);

  // 加载 Agent 数据
  const fetchAgent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { error, data } = await client.get("/api/ai/agents/:id", { params: { id } }) as { error?: unknown; data?: AgentItem };
      if (!error && data) {
        setAgent(data);
        form.setFieldsValue(data);
        setSelectedTools(data.tools ?? []);
        setSelectedSkills(data.skillIds ?? []);
        setSelectedMcp(data.mcpServerIds ?? []);
        setSelectedKbs(data.knowledgeBaseIds ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  // 保存
  const handleSave = async () => {
    if (!id) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const body = {
        ...values,
        tools: selectedTools.length > 0 ? selectedTools : null,
        skillIds: selectedSkills.length > 0 ? selectedSkills : null,
        mcpServerIds: selectedMcp.length > 0 ? selectedMcp : null,
        knowledgeBaseIds: selectedKbs.length > 0 ? selectedKbs : null,
      };
      const { error } = await client.put("/api/ai/agents/:id", { params: { id }, body });
      if (!error) { message.success("保存成功"); fetchAgent(); }
    } catch {} finally { setSaving(false); }
  };

  const s = agent ? statusMap[agent.status] ?? { label: agent.status, color: "default" } : null;

  // 工具列表（带分类图标）
  const toolItems = useMemo(() => tools.map(t => ({
    id: t.id, name: t.name, description: t.description, disabled: false,
  })), [tools]);

  const riskColor: Record<string, string> = { low: "green", medium: "orange", high: "red", critical: "magenta" };

  return (
    <div style={{ padding: 24 }}>
      {/* 顶部栏 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/agents")}>返回</Button>
          <RobotOutlined style={{ fontSize: 20 }} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>{agent?.name || "加载中..."}</span>
          {s && <Tag color={s.color}>{s.label}</Tag>}
        </Space>
        <Space>
          <Button icon={<MessageOutlined />} onClick={() => navigate("/app/ai/chat")}>测试对话</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存</Button>
        </Space>
      </div>

      <Row gutter={24}>
        {/* ── 左列：基础信息 ── */}
        <Col xs={24} lg={10}>
          <Card title="基础信息" size="small">
            <Form form={form} layout="vertical">
              <Form.Item label="名称" name="name" rules={[{ required: true }]}>
                <Input placeholder="Agent 名称" />
              </Form.Item>
              <Form.Item label="描述" name="description">
                <TextArea rows={2} placeholder="Agent 描述" />
              </Form.Item>
              <Form.Item label="模型" name="model" rules={[{ required: true }]}>
                <Select options={modelOptions} placeholder="选择模型" showSearch
                  filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Form.Item>
              <Form.Item label="系统提示词" name="systemPrompt" rules={[{ required: true }]}>
                <TextArea rows={8} placeholder="定义 Agent 的行为、角色和能力边界..." style={{ fontFamily: "monospace" }} />
              </Form.Item>
              <Form.Item label="公开" name="isPublic" valuePropName="checked">
                <Switch checkedChildren="公开" unCheckedChildren="私有" />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* ── 右列：能力配置 ── */}
        <Col xs={24} lg={14}>
          <Card title="能力配置" size="small">
            <Tabs
              size="small"
              items={[
                {
                  key: "tools",
                  label: <span><ToolOutlined /> 工具 <Tag>{selectedTools.length}</Tag></span>,
                  children: (
                    <AbilityPanel
                      title="内置工具" icon={<ToolOutlined />}
                      items={toolItems} selected={selectedTools} onChange={setSelectedTools}
                      renderItem={item => (
                        <div>
                          <Space>
                            <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                            {item.description && <Text type="secondary" style={{ fontSize: 12 }}>— {item.description}</Text>}
                          </Space>
                        </div>
                      )}
                    />
                  ),
                },
                {
                  key: "skills",
                  label: <span><BlockOutlined /> 技能 <Tag>{selectedSkills.length}</Tag></span>,
                  children: (
                    <AbilityPanel
                      title="技能" icon={<BlockOutlined />}
                      items={skills.map(s => ({ ...s, disabled: !s.enabled }))}
                      selected={selectedSkills} onChange={setSelectedSkills}
                      renderItem={item => (
                        <div>
                          <Space>
                            <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                            {!item.enabled && <Tag color="red" style={{ fontSize: 11 }}>已禁用</Tag>}
                          </Space>
                          {item.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text></div>}
                        </div>
                      )}
                    />
                  ),
                },
                {
                  key: "mcp",
                  label: <span><ThunderboltOutlined /> MCP <Tag>{selectedMcp.length}</Tag></span>,
                  children: (
                    <AbilityPanel
                      title="MCP 服务" icon={<ThunderboltOutlined />}
                      items={mcpServers.map(m => ({
                        id: m.id, name: m.name, description: m.description,
                        disabled: m.status !== "connected",
                      }))}
                      selected={selectedMcp} onChange={setSelectedMcp}
                      renderItem={item => {
                        const mcp = mcpServers.find(m => m.id === item.id);
                        return (
                          <div>
                            <Space>
                              <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                              {mcp && <Tag color={mcp.status === "connected" ? "green" : "red"} style={{ fontSize: 11 }}>{mcp.status === "connected" ? "已连接" : "未连接"}</Tag>}
                              {mcp && mcp.toolCount > 0 && <Tag style={{ fontSize: 11 }}>{mcp.toolCount} 工具</Tag>}
                            </Space>
                            {item.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text></div>}
                          </div>
                        );
                      }}
                    />
                  ),
                },
                {
                  key: "kb",
                  label: <span><BookOutlined /> 知识库 <Tag>{selectedKbs.length}</Tag></span>,
                  children: (
                    <AbilityPanel
                      title="知识库" icon={<BookOutlined />}
                      items={knowledgeBases}
                      selected={selectedKbs} onChange={setSelectedKbs}
                      renderItem={item => (
                        <div>
                          <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                          {item.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text></div>}
                        </div>
                      )}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
