import { useState, useCallback, useEffect } from "react";
import { Card, Checkbox, Col, Empty, Row, Table, Button, Input, InputNumber, Radio, Space, Tag, Modal, Form, Select, Switch, Tabs, Typography, message, theme } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, RobotOutlined,
  ToolOutlined, BlockOutlined, ThunderboltOutlined, BookOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { AgentItem, PaginatedData } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";

const { TextArea } = Input;
const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  active: { label: "已发布", color: "green" },
  disabled: { label: "已停用", color: "red" },
};

// 默认选中的工具
const DEFAULT_TOOLS = ["file_read", "file_write", "file_edit", "web_search", "web_fetch", "datetime"];

// Agent 类型与探索强度
const AGENT_TYPES = [
  { label: "智能问答", value: "chatbot", description: "知识库检索 + 记忆 + 网络搜索，适合日常问答" },
  { label: "深度研究", value: "deep_research", description: "多轮规划检索、交叉验证，输出带引用的研究报告" },
];

const RESEARCH_DEPTHS = [
  { label: "快速", value: "quick", description: "6 轮以内，轻量探索" },
  { label: "常规", value: "normal", description: "10 轮左右，平衡速度与深度" },
  { label: "深度", value: "deep", description: "20 轮以内，穷尽式调研" },
];

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
      <div className="flex justify-between items-center mb-2">
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
        <div className="max-h-[360px] overflow-auto">
          {items.map(item => {
            const checked = selected.includes(item.id);
            return (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-md mb-1" style={{ padding: "8px 12px", cursor: item.disabled ? "not-allowed" : "pointer", background: checked ? token.colorPrimaryBg : "transparent", border: `1px solid ${checked ? token.colorPrimaryBorder : "transparent"}`, opacity: item.disabled ? 0.5 : 1 }}
                onClick={() => {
                  if (item.disabled) return;
                  onChange(checked ? selected.filter(id => id !== item.id) : [...selected, item.id]);
                }}
              >
                <Checkbox checked={checked} disabled={item.disabled} className="mt-0.5"
                  onChange={e => {
                    if (item.disabled) return;
                    onChange(e.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id));
                  }}
                />
                <div className="flex-1 min-w-0">
                  {renderItem ? renderItem(item) : (
                    <>
                      <div className="font-medium text-[13px]">{item.name}</div>
                      {item.description && <Text type="secondary" className="text-xs">{item.description}</Text>}
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
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  
  // Modal 状态
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  // 能力数据
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; options: Array<{ label: string; value: string }> }>>([]);
  const [tools, setTools] = useState<Array<{ id: string; name: string; description: string; riskLevel: string }>>([]);
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string | null; enabled: boolean }>>([]);
  const [mcpServers, setMcpServers] = useState<Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }>>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  // 选中的能力
  const [selectedTools, setSelectedTools] = useState<string[]>(DEFAULT_TOOLS);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedMcp, setSelectedMcp] = useState<string[]>([]);
  const [selectedKbs, setSelectedKbs] = useState<string[]>([]);

  // 记忆配置（对应 ai_agent.memory_config）
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryLongTerm, setMemoryLongTerm] = useState(false);
  const [memoryMaxHistory, setMemoryMaxHistory] = useState<number>(20);

  // Agent 类型与深度研究配置（对应 ai_agent.config.research）
  const [agentType, setAgentType] = useState<string>("chatbot");
  const [researchDepth, setResearchDepth] = useState<string>("normal");
  // 深度研究自定义预算（覆盖 RESEARCH_DEPTH_MAP 预设，留空则使用深度预设默认值）
  const [researchMaxIterations, setResearchMaxIterations] = useState<number | undefined>(undefined);
  const [researchMaxTokens, setResearchMaxTokens] = useState<number | undefined>(undefined);
  const [researchSearchCount, setResearchSearchCount] = useState<number | undefined>(undefined);
  const [researchMaxSubtasks, setResearchMaxSubtasks] = useState<number | undefined>(undefined);
  const [researchMaxSubtaskTurns, setResearchMaxSubtaskTurns] = useState<number | undefined>(undefined);

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

  // Fetch tools and set defaults
  useEffect(() => {
    client.get("/api/ai/tools").then(({ data }) => {
      const list = data as Array<{ name: string; description: string; riskLevel: string }> | undefined;
      if (list?.length) {
        setTools(list.map(t => ({ id: t.name, ...t })));
      }
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

  useEffect(() => { refresh(1); }, [refresh]);

  const handleSearch = () => { setPage(1); refresh(1); };
  const handleReset = () => { setSearchText(""); setPage(1); refresh(1, pageSize); };
  const handlePageChange = (p: number, ps: number) => { setPage(p); setPageSize(ps); refresh(p, ps); };

  const resetModal = () => {
    form.resetFields();
    setSelectedTools(DEFAULT_TOOLS.filter(name => tools.some(t => t.name === name)));
    setSelectedSkills([]);
    setSelectedMcp([]);
    setSelectedKbs([]);
    setMemoryEnabled(true);
    setMemoryLongTerm(false);
    setMemoryMaxHistory(20);
    setAgentType("chatbot");
    setResearchDepth("normal");
    setResearchMaxIterations(undefined);
    setResearchMaxTokens(undefined);
    setResearchSearchCount(undefined);
    setResearchMaxSubtasks(undefined);
    setResearchMaxSubtaskTurns(undefined);
    setEditingAgent(null);
  };

  // 打开新增 Modal
  const handleOpenCreate = () => {
    setModalMode("create");
    resetModal();
    setModalOpen(true);
  };

  // 打开编辑 Modal
  const handleOpenEdit = async (record: AgentItem) => {
    setModalMode("edit");
    setEditingAgent(record);
    setModalOpen(true);
    
    // 设置表单值
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      model: record.model,
      systemPrompt: record.systemPrompt,
      isPublic: record.isPublic,
      maxIterations: record.maxIterations ?? 10,
      maxTokensPerTurn: record.maxTokensPerTurn ?? 4096,
    });

    // 设置记忆配置
    setMemoryEnabled(record.memoryConfig?.enabled ?? true);
    setMemoryLongTerm(record.memoryConfig?.longTerm ?? false);
    setMemoryMaxHistory(record.memoryConfig?.maxHistoryMessages ?? 20);

    // 设置类型与深度研究配置
    const research = record.config?.research as
      | { depth?: string; maxIterations?: number; maxTokensPerTurn?: number; searchCount?: number; maxSubtasks?: number; maxSubtaskTurns?: number }
      | undefined;
    const depth = research?.depth;
    setAgentType(depth ? "deep_research" : "chatbot");
    setResearchDepth(depth ?? "normal");
    setResearchMaxIterations(research?.maxIterations);
    setResearchMaxTokens(research?.maxTokensPerTurn);
    setResearchSearchCount(research?.searchCount);
    setResearchMaxSubtasks(research?.maxSubtasks);
    setResearchMaxSubtaskTurns(research?.maxSubtaskTurns);
    
    // 设置选中的能力
    setSelectedTools(record.tools ?? []);
    setSelectedSkills(record.skillIds ?? []);
    setSelectedMcp(record.mcpServerIds ?? []);
    setSelectedKbs(record.knowledgeBaseIds ?? []);
  };

  // 深度研究自定义预算：仅包含已填写的字段（覆盖 RESEARCH_DEPTH_MAP 预设）
  const buildResearchBudget = () => ({
    ...(researchMaxIterations ? { maxIterations: researchMaxIterations } : {}),
    ...(researchMaxTokens ? { maxTokensPerTurn: researchMaxTokens } : {}),
    ...(researchSearchCount ? { searchCount: researchSearchCount } : {}),
    ...(researchMaxSubtasks ? { maxSubtasks: researchMaxSubtasks } : {}),
    ...(researchMaxSubtaskTurns ? { maxSubtaskTurns: researchMaxSubtaskTurns } : {}),
  });

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const body = {
        ...values,
        memoryConfig: {
          enabled: memoryEnabled,
          longTerm: memoryLongTerm,
          maxHistoryMessages: memoryMaxHistory,
        },
        ...(agentType === "deep_research"
          ? { config: { research: { depth: researchDepth, ...buildResearchBudget() } } }
          : {}),
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

  const handleUpdate = async () => {
    if (!editingAgent) return;
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const body = {
        ...values,
        memoryConfig: {
          enabled: memoryEnabled,
          longTerm: memoryLongTerm,
          maxHistoryMessages: memoryMaxHistory,
        },
        config: agentType === "deep_research" ? { research: { depth: researchDepth, ...buildResearchBudget() } } : null,
        tools: selectedTools.length > 0 ? selectedTools : null,
        skillIds: selectedSkills.length > 0 ? selectedSkills : null,
        mcpServerIds: selectedMcp.length > 0 ? selectedMcp : null,
        knowledgeBaseIds: selectedKbs.length > 0 ? selectedKbs : null,
      };
      const { error } = await client.put("/api/ai/agents/:id", { 
        params: { id: editingAgent.id },
        body 
      });
      if (!error) {
        message.success("更新成功");
        setModalOpen(false);
        resetModal();
        refresh();
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
        <a onClick={() => handleOpenEdit(record)}>
          <RobotOutlined className="mr-2" />{text}
        </a>
      ),
    },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    { title: "模型", dataIndex: "model", key: "model", width: 120 },
    {
      title: "类型", key: "type", width: 100,
      render: (_, record) => (record.config?.research as { depth?: string } | undefined)?.depth
        ? <Tag color="purple">深度研究</Tag>
        : <Tag color="blue">智能问答</Tag>,
    },
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
            { label: "编辑", onClick: () => handleOpenEdit(record) },
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
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>创建 Agent</Button>
          </Space>
        }
      >
        <Space className="mb-4">
          <Input placeholder="搜索 Agent..." prefix={<SearchOutlined />} value={searchText}
            onChange={(e) => setSearchText(e.target.value)} className="w-[300px]" onPressEnter={handleSearch} />
          <Button onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, pageSize, total, onChange: handlePageChange }} />
      </Card>

      <Modal 
        title={modalMode === "create" ? "创建 Agent" : "编辑 Agent"} 
        open={modalOpen} 
        onOk={modalMode === "create" ? handleCreate : handleUpdate}
        onCancel={() => { setModalOpen(false); resetModal(); }}
        confirmLoading={modalLoading} 
        okText={modalMode === "create" ? "创建" : "保存"} 
        cancelText="取消" 
        width={960}
      >
        <Row gutter={24} className="mt-4">
          {/* ── 左列：基础信息 ── */}
          <Col xs={24} lg={10}>
            <Form form={form} layout="vertical">
              <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入 Agent 名称" }]}>
                <Input placeholder="例如：智能客服助手" />
              </Form.Item>
              <Form.Item label="类型">
                <Select
                  value={agentType}
                  onChange={setAgentType}
                  options={AGENT_TYPES.map(t => ({
                    label: (
                      <Space direction="vertical" size={0}>
                        <span>{t.label}</span>
                        <Text type="secondary" style={{ fontSize: 12 }}>{t.description}</Text>
                      </Space>
                    ),
                    value: t.value,
                  }))}
                />
              </Form.Item>
              {agentType === "deep_research" && (
                <>
                <Form.Item label="探索强度" tooltip="决定研究轮次、Token 预算与每轮检索数量">
                  <Radio.Group
                    value={researchDepth}
                    onChange={(e) => setResearchDepth(e.target.value)}
                    className="w-full"
                  >
                    <Space direction="vertical" className="w-full">
                      {RESEARCH_DEPTHS.map(d => (
                        <Radio key={d.value} value={d.value} className="flex items-center">
                          <Space direction="vertical" size={0}>
                            <span>{d.label}</span>
                            <Text type="secondary" style={{ fontSize: 12 }}>{d.description}</Text>
                          </Space>
                        </Radio>
                      ))}
                    </Space>
                  </Radio.Group>
                </Form.Item>
                <Form.Item label="自定义预算" tooltip="覆盖深度预设的计算预算，留空使用预设默认值（子任务上限默认 6、单子任务轮数默认 4）">
                  <div className="grid grid-cols-2 gap-2">
                    <InputNumber
                      min={1} max={200} placeholder="迭代轮数（预设覆盖）"
                      value={researchMaxIterations}
                      onChange={(v) => setResearchMaxIterations(v ?? undefined)}
                      className="w-full"
                    />
                    <InputNumber
                      min={64} max={128000} step={256} placeholder="单轮 Token（预设覆盖）"
                      value={researchMaxTokens}
                      onChange={(v) => setResearchMaxTokens(v ?? undefined)}
                      className="w-full"
                    />
                    <InputNumber
                      min={1} max={20} placeholder="每轮检索次数"
                      value={researchSearchCount}
                      onChange={(v) => setResearchSearchCount(v ?? undefined)}
                      className="w-full"
                    />
                    <InputNumber
                      min={1} max={12} placeholder="子任务数量上限"
                      value={researchMaxSubtasks}
                      onChange={(v) => setResearchMaxSubtasks(v ?? undefined)}
                      className="w-full"
                    />
                    <InputNumber
                      min={1} max={10} placeholder="单子任务轮数上限"
                      value={researchMaxSubtaskTurns}
                      onChange={(v) => setResearchMaxSubtaskTurns(v ?? undefined)}
                      className="w-full"
                    />
                  </div>
                  <Text type="secondary" className="text-xs">留空则使用所选探索强度的预设值</Text>
                </Form.Item>
                </>
              )}
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
              <Form.Item label="最大迭代轮数" name="maxIterations" tooltip="Agent 单次对话中允许的最多工具调用轮次（默认 10）">
                <InputNumber min={1} max={100} className="w-full" placeholder="默认 10" />
              </Form.Item>
              <Form.Item label="最大单轮 Token" name="maxTokensPerTurn" tooltip="每轮生成的 Token 上限（默认 4096）">
                <InputNumber min={64} max={128000} step={256} className="w-full" placeholder="默认 4096" />
              </Form.Item>
              <div className="rounded-md mb-2 p-3" style={{ border: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillTertiary }}>
                <Text strong className="mb-2 block">记忆配置</Text>
                <div className="flex items-center justify-between mb-2">
                  <Space>
                    <Switch size="small" checked={memoryEnabled} onChange={setMemoryEnabled} />
                    <Text className="text-[13px]">对话记忆</Text>
                  </Space>
                  <Text type="secondary" className="text-xs">读写会话历史，按用户隔离</Text>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <Space>
                    <Switch size="small" checked={memoryLongTerm} onChange={setMemoryLongTerm} />
                    <Text className="text-[13px]">长期记忆</Text>
                  </Space>
                  <Text type="secondary" className="text-xs">注入用户长期记忆摘要</Text>
                </div>
                <div className="flex items-center justify-between">
                  <Space>
                    <Text className="text-[13px]">历史消息数</Text>
                  </Space>
                  <InputNumber
                    size="small" min={1} max={100} disabled={!memoryEnabled}
                    value={memoryMaxHistory} onChange={(v) => setMemoryMaxHistory(v ?? 20)}
                    className="w-[100px]" addonAfter="条"
                  />
                </div>
              </div>
            </Form>
          </Col>

          {/* ── 右列：能力配置 ── */}
          <Col xs={24} lg={14}>
            <div className="rounded-lg p-4" style={{ border: `1px solid ${token.colorBorderSecondary}` }}>
              <Tabs
                size="small"
                items={[
                  {
                    key: "tools",
                    label: <span><ToolOutlined /> 工具 <Tag>{selectedTools.length}</Tag></span>,
                    children: (
                      <AbilityPanel
                        title="内置工具" icon={<ToolOutlined />}
                        items={tools}
                        selected={selectedTools} onChange={setSelectedTools}
                        renderItem={item => (
                          <div>
                            <div className="font-medium text-[13px]">{item.name}</div>
                            {item.description && <Text type="secondary" className="text-xs">{item.description}</Text>}
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
                              <Text strong className="text-[13px]">{item.name}</Text>
                              {!item.enabled && <Tag color="red" className="text-[11px]">已禁用</Tag>}
                            </Space>
                            {item.description && <div><Text type="secondary" className="text-xs">{item.description}</Text></div>}
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
                                <Text strong className="text-[13px]">{item.name}</Text>
                                {mcp && <Tag color={mcp.status === "connected" ? "green" : "red"} className="text-[11px]">{mcp.status === "connected" ? "已连接" : "未连接"}</Tag>}
                                {mcp && mcp.toolCount > 0 && <Tag className="text-[11px]">{mcp.toolCount} 工具</Tag>}
                              </Space>
                              {item.description && <div><Text type="secondary" className="text-xs">{item.description}</Text></div>}
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
                            <Text strong className="text-[13px]">{item.name}</Text>
                            {item.description && <div><Text type="secondary" className="text-xs">{item.description}</Text></div>}
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
