import { useState, useCallback, useEffect } from "react";
import { Card, Checkbox, Col, Empty, Row, Table, Button, Input, Space, Tag, Modal, Form, Select, Switch, Tabs, Typography, message, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, RobotOutlined,
  ToolOutlined, BlockOutlined, ThunderboltOutlined, BookOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { AgentItem, PaginatedData } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";
import { useNavigate } from "react-router-dom";

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

const AgentsPage = () => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  // 能力数据
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; options: Array<{ label: string; value: string }> }>>([]);
  const [tools, setTools] = useState<Array<{ id: string; name: string; description: string; riskLevel: string }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string | null; enabled: boolean }>>([]);
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }>>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  // 选中的能力
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<string[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<string[]>([]);

  // Fetch models
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
  }, []);

  // Fetch tools
  useEffect(() => {
    client.get("/api/ai/tools").then(({ data }) => {
      const list = data as Array<{ name: string; description: string; riskLevel: string }> | undefined;
      if (list?.length) setTools(list.map((t, i) => ({ id: `tool_${i}`, ...t })));
    }).catch(() => {});
  }, []);

  // Fetch skills
  useEffect(() => {
    client.get("/api/ai/skills", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null; enabled: boolean }> })?.list;
      if (list?.length) setSkills(list);
    }).catch(() => {});
  }, []);

  // Fetch MCP servers
  useEffect(() => {
    client.get("/api/ai/mcp-servers", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }> })?.list;
      if (list?.length) setMcpServers(list);
    }).catch(() => {});
  }, []);

  // Fetch knowledge bases
  useEffect(() => {
    client.get("/api/ai/knowledge-bases", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null }> })?.list;
      if (list?.length) setKnowledgeBases(list);
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async (p?: number, ps?: number) => {
    setLoading(true);
    try {
      const currentPage = p ?? page;
      const currentPageSize = ps ?? pageSize;
      const query: Record<string, unknown> = { page: currentPage, pageSize: currentPageSize };
      if (searchText) query.name = searchText;
      const { error, data: result } = await client.get("/api/ai/agents", { query }) as {
        error?: unknown; data?: PaginatedData<AgentItem>;
      };
      if (!error && result) {
        setData(result.list);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchText]);

  useEffect(() => { refresh(1); }, []);

  const handleSearch = () => { setPage(1); refresh(1); };
  const handleReset = () => { setSearchText(""); setPage(1); refresh(1, pageSize); };
  const handlePageChange = (p: number, ps: number) => { setPage(p); setPageSize(ps); refresh(p, ps); };

  const resetModal = () => {
    form.resetFields();
    setSelectedTools([]);
    setSelectedSkills([]);
    setSelectedMcp([]);
    setSelectedKbs([]);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const body = {
        ...values,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        skillIds: selectedSkills.length > 0 ? selectedSkills : undefined,
        mcpServerIds: selectedMcp.length > 0 ? selectedMcp : undefined,
        knowledgeBaseIds: selectedKbs.length > 0 ? selectedKbs : undefined,
      };
      const { error } = await client.post("/api/ai/agents", { body });
      if (!error) {
        message.success("创建成功");
        setModalOpen(false);
        resetModal();
        refresh(1);
      }
    } catch {} finally {
      setModalLoading(false);
    }
  };

  const handleDelete = (record: AgentItem) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除 Agent「${record.name}」吗？`,
      okText: "删除",
      okType: "danger",
      onOk: async () => {
        const { error } = await client.delete("/api/ai/agents/:id", { params: { id: record.id } });
        if (!error) { message.success("删除成功"); refresh(); }
      },
    });
  };

  const handlePublish = async (record: AgentItem) => {
    const { error } = await client.post("/api/ai/agents/:id/publish", { params: { id: record.id } });
    if (!error) { message.success("发布成功"); refresh(); }
  };

  const columns: ColumnsType<AgentItem> = [
    {
      title: "名称", dataIndex: "name", key: "name",
      render: (text: string, record) => (
        <a onClick={() => navigate(`/app/ai/agents/${record.id}`)}>
          <RobotOutlined style={{ marginRight: 8 }} />{text}
        </a>
      ),
    },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    { title: "模型", dataIndex: "model", key: "model", width: 120 },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status: string) => { const s = statusMap[status] || { label: status, color: "default" }; return <Tag color={s.color}>{s.label}</Tag>; },
    },
    {
      title: "公开", dataIndex: "isPublic", key: "isPublic", width: 80,
      render: (isPublic: boolean) => isPublic ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", width: 180,
      render: (date: string) => fmtDate(date),
    },
    {
      title: "操作", key: "action", width: 180,
      render: (_, record) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => navigate(`/app/ai/agents/${record.id}`) },
            ...(record.status === "draft" ? [{ label: "发布", onClick: () => handlePublish(record) }] : []),
            { label: "删除", onClick: () => handleDelete(record), danger: true, confirm: "确定删除？" },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Card
        title="Agent 管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refresh()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>创建 Agent</Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Input placeholder="搜索 Agent..." prefix={<SearchOutlined />} value={searchText}
            onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} onPressEnter={handleSearch} />
          <Button onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, pageSize, total, onChange: handlePageChange }} />
      </Card>

      <Modal title="创建 Agent" open={modalOpen} onOk={handleCreate}
        onCancel={() => { setModalOpen(false); resetModal(); }}
        confirmLoading={modalLoading} okText="创建" cancelText="取消" width={960}>
        <Row gutter={24} style={{ marginTop: 16 }}>
          {/* ── 左列：基础信息 ── */}
          <Col xs={24} lg={10}>
            <Form form={form} layout="vertical">
              <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入 Agent 名称" }]}>
                <Input placeholder="例如：智能客服助手" />
              </Form.Item>
              <Form.Item label="模型" name="model" rules={[{ required: true }]}>
                <Select options={modelOptions} placeholder="选择模型" showSearch
                  filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
              </Form.Item>
              <Form.Item label="描述" name="description">
                <TextArea rows={2} placeholder="Agent 描述（可选）" />
              </Form.Item>
              <Form.Item label="系统提示词" name="systemPrompt" rules={[{ required: true, message: "请输入系统提示词" }]}>
                <TextArea rows={6} placeholder="定义 Agent 的行为、角色和能力边界..." style={{ fontFamily: "monospace" }} />
              </Form.Item>
              <Form.Item label="公开" name="isPublic" valuePropName="checked">
                <Switch checkedChildren="公开" unCheckedChildren="私有" />
              </Form.Item>
            </Form>
          </Col>

          {/* ── 右列：能力配置 ── */}
          <Col xs={24} lg={14}>
            <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: 16 }}>
              <Tabs
                size="small"
                items={[
                  {
                    key: "tools",
                    label: <span><ToolOutlined /> 工具 <Tag>{selectedTools.length}</Tag></span>,
                    children: (
                      <AbilityPanel
                        title="内置工具" icon={<ToolOutlined />}
                        items={tools.map(t => ({ ...t, id: t.name }))}
                        selected={selectedTools} onChange={setSelectedTools}
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
            </div>
          </Col>
        </Row>
      </Modal>
    </>
  );
};

export default AgentsPage;
