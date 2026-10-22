import { client } from '@/api';
import type { AgentItem, PaginatedData, RuntimeAvailability } from '@/api/types';
import ActionColumn from '@/components/ActionColumn';
import { fmtDate } from '@/utils/fmtDate';
import {
  BlockOutlined,
  BookOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import { agentMutationValues } from './mutation';

const { TextArea } = Input;
const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  active: { label: '已发布', color: 'green' },
  disabled: { label: '已停用', color: 'red' },
};

// 默认选中的工具
const DEFAULT_TOOLS = [
  'file_read',
  'file_write',
  'file_edit',
  'web_search',
  'web_fetch',
  'datetime',
];

// Agent 类型与探索强度
const AGENT_TYPES = [
  {
    label: '智能问答',
    value: 'chatbot',
    description: '知识库检索 + 记忆 + 网络搜索，适合日常问答',
  },
  {
    label: '深度研究',
    value: 'deep_research',
    description: '多轮规划检索、交叉验证，输出带引用的研究报告',
  },
];

const RESEARCH_DEPTHS = [
  { label: '快速', value: 'quick', description: '6 轮以内，轻量探索' },
  { label: '常规', value: 'normal', description: '10 轮左右，平衡速度与深度' },
  { label: '深度', value: 'deep', description: '20 轮以内，穷尽式调研' },
];

// 编辑弹窗 Tab 归属：校验失败时据此切到出错字段所在的 Tab，避免错误提示藏在隐藏 Tab 中
const FIELD_TAB: Record<string, string> = {
  name: 'basic',
  model: 'models',
  systemPrompt: 'session',
};

// ── 能力选择面板组件 ──

function AbilityPanel({
  title,
  icon,
  items,
  selected,
  onChange,
  renderItem,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ id: string; name: string; description?: string | null; disabled?: boolean }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  renderItem?: (item: {
    id: string;
    name: string;
    description?: string | null;
    disabled?: boolean;
  }) => React.ReactNode;
}) {
  const { token } = theme.useToken();
  const allIds = items.filter((i) => !i.disabled).map((i) => i.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const indeterminate = selected.length > 0 && !allChecked;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <Space>
          {icon}
          <Text strong>{title}</Text>
          <Tag>
            {selected.length}/{items.length}
          </Tag>
        </Space>
        <Checkbox
          indeterminate={indeterminate}
          checked={allChecked}
          onChange={(e) => onChange(e.target.checked ? allIds : [])}
        >
          全选
        </Checkbox>
      </div>
      {items.length === 0 ? (
        <Empty description={`暂无${title}`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="max-h-[360px] overflow-auto">
          {items.map((item) => {
            const checked = selected.includes(item.id);
            return (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-md mb-1"
                style={{
                  padding: '8px 12px',
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  background: checked ? token.colorPrimaryBg : 'transparent',
                  border: `1px solid ${checked ? token.colorPrimaryBorder : 'transparent'}`,
                  opacity: item.disabled ? 0.5 : 1,
                }}
                onClick={() => {
                  if (item.disabled) return;
                  onChange(
                    checked ? selected.filter((id) => id !== item.id) : [...selected, item.id],
                  );
                }}
              >
                <Checkbox
                  checked={checked}
                  disabled={item.disabled}
                  className="mt-0.5"
                  onChange={(e) => {
                    if (item.disabled) return;
                    onChange(
                      e.target.checked
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id),
                    );
                  }}
                />
                <div className="flex-1 min-w-0">
                  {renderItem ? (
                    renderItem(item)
                  ) : (
                    <>
                      <div className="font-medium text-[13px]">{item.name}</div>
                      {item.description && (
                        <Text type="secondary" className="text-xs">
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
      )}
    </div>
  );
}

// ── 主页面 ──

const AgentsPage = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState('');

  // Modal 状态
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const requiresVm = Form.useWatch('requiresVirtualEnvironment', form) === true;
  const [vmAvailability, setVmAvailability] = useState<RuntimeAvailability | null>(null);
  const [vmChecking, setVmChecking] = useState(false);

  // 能力数据
  const [modelOptions, setModelOptions] = useState<
    Array<{ label: string; options: Array<{ label: string; value: string }> }>
  >([]);
  // 决策模型可选项：仅 JEV 结构化决策模型（providerApiFormat === 'jev'）
  const [jevModelOptions, setJevModelOptions] = useState<Array<{ label: string; value: string }>>(
    [],
  );
  const [tools, setTools] = useState<
    Array<{ id: string; name: string; description: string; riskLevel: string }>
  >([]);
  const [skills, setSkills] = useState<
    Array<{ id: string; name: string; description: string | null; enabled: boolean }>
  >([]);
  const [mcpServers, setMcpServers] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      status: string;
      toolCount: number;
    }>
  >([]);
  const [knowledgeBases, setKnowledgeBases] = useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);

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
  const [agentType, setAgentType] = useState<string>('chatbot');
  const [researchDepth, setResearchDepth] = useState<string>('normal');
  // 深度研究自定义预算（覆盖 RESEARCH_DEPTH_MAP 预设，留空则使用深度预设默认值）
  const [researchMaxIterations, setResearchMaxIterations] = useState<number | undefined>(undefined);
  const [researchMaxTokens, setResearchMaxTokens] = useState<number | undefined>(undefined);
  const [researchSearchCount, setResearchSearchCount] = useState<number | undefined>(undefined);
  const [researchMaxSubtasks, setResearchMaxSubtasks] = useState<number | undefined>(undefined);
  const [researchMaxSubtaskTurns, setResearchMaxSubtaskTurns] = useState<number | undefined>(
    undefined,
  );

  // 轻量模型（config.summaryModel）、子智能体模型（config.approvalModel）、
  // 决策模型（config.decisionModel）与默认思考强度（config.defaultThinkingLevel）
  const [summaryModel, setSummaryModel] = useState<string | undefined>(undefined);
  const [approvalModel, setApprovalModel] = useState<string | undefined>(undefined);
  const [decisionModel, setDecisionModel] = useState<string | undefined>(undefined);
  const [defaultThinkingLevel, setDefaultThinkingLevel] = useState<string>('off');

  // 编辑弹窗当前 Tab
  const [activeTab, setActiveTab] = useState('basic');

  // Fetch models
  useEffect(() => {
    client
      .get('/api/ai/models')
      .then(({ data }) => {
        const models = data as
          | Array<{
              modelId: string;
              displayName: string | null;
              providerName: string;
              providerApiFormat: string;
            }>
          | undefined;
        if (!models?.length) return;
        // JEV 是结构化决策 API（非对话），只能作为「决策模型」；对话类模型选项需排除它
        setJevModelOptions(
          models
            .filter((m) => m.providerApiFormat === 'jev')
            .map((m) => ({ label: m.displayName || m.modelId, value: m.modelId })),
        );
        const groupMap = new Map<string, Array<{ label: string; value: string }>>();
        for (const m of models) {
          if (m.providerApiFormat === 'jev') continue;
          const group = m.providerName || '其他';
          if (!groupMap.has(group)) groupMap.set(group, []);
          groupMap.get(group)!.push({ label: m.displayName || m.modelId, value: m.modelId });
        }
        setModelOptions(
          Array.from(groupMap.entries()).map(([label, options]) => ({ label, options })),
        );
      })
      .catch(() => {});
  }, []);

  // Fetch tools and set defaults
  useEffect(() => {
    client
      .get('/api/ai/tools')
      .then(({ data }) => {
        const list = data as
          | Array<{ name: string; description: string; riskLevel: string }>
          | undefined;
        if (list?.length) {
          setTools(list.map((t) => ({ id: t.name, ...t })));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch skills
  useEffect(() => {
    client
      .get('/api/ai/skills', { query: { pageSize: 100 } })
      .then(({ data }) => {
        const list = (
          data as {
            list?: Array<{
              id: string;
              name: string;
              description: string | null;
              enabled: boolean;
            }>;
          }
        )?.list;
        if (list?.length) setSkills(list);
      })
      .catch(() => {});
  }, []);

  // Fetch MCP servers
  useEffect(() => {
    client
      .get('/api/ai/mcp-servers', { query: { pageSize: 100 } })
      .then(({ data }) => {
        const list = (
          data as {
            list?: Array<{
              id: string;
              name: string;
              description: string | null;
              status: string;
              toolCount: number;
            }>;
          }
        )?.list;
        if (list?.length) setMcpServers(list);
      })
      .catch(() => {});
  }, []);

  // Fetch knowledge bases
  useEffect(() => {
    client
      .get('/api/ai/knowledge-bases', { query: { pageSize: 100 } })
      .then(({ data }) => {
        const list = (
          data as { list?: Array<{ id: string; name: string; description: string | null }> }
        )?.list;
        if (list?.length) setKnowledgeBases(list);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(
    async (p?: number, ps?: number) => {
      setLoading(true);
      try {
        const currentPage = p ?? page;
        const currentPageSize = ps ?? pageSize;
        const query: Record<string, unknown> = { page: currentPage, pageSize: currentPageSize };
        if (searchText) query.search = searchText;
        const { error, data: result } = (await client.get('/api/ai/agents', { query })) as {
          error?: unknown;
          data?: PaginatedData<AgentItem>;
        };
        if (!error && result) {
          setData(result.list);
          setTotal(result.total);
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, searchText],
  );

  useEffect(() => {
    refresh(1);
  }, [refresh]);

  const handleSearch = () => {
    setPage(1);
    refresh(1);
  };
  const handleReset = () => {
    setSearchText('');
    setPage(1);
    refresh(1, pageSize);
  };
  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
    refresh(p, ps);
  };

  const resetModal = () => {
    form.resetFields();
    setSelectedTools(DEFAULT_TOOLS.filter((name) => tools.some((t) => t.name === name)));
    setSelectedSkills([]);
    setSelectedMcp([]);
    setSelectedKbs([]);
    setMemoryEnabled(true);
    setMemoryLongTerm(false);
    setMemoryMaxHistory(20);
    setAgentType('chatbot');
    setResearchDepth('normal');
    setResearchMaxIterations(undefined);
    setResearchMaxTokens(undefined);
    setResearchSearchCount(undefined);
    setResearchMaxSubtasks(undefined);
    setResearchMaxSubtaskTurns(undefined);
    setSummaryModel(undefined);
    setApprovalModel(undefined);
    setDecisionModel(undefined);
    setDefaultThinkingLevel('off');
    setActiveTab('basic');
    setVmAvailability(null);
    setEditingAgent(null);
  };

  const handleVmToggle = async (checked: boolean) => {
    if (!checked) {
      setVmAvailability(null);
      return;
    }
    setVmChecking(true);
    try {
      const runtimeClient = client as unknown as {
        get(path: string): Promise<{ data?: unknown; error?: unknown }>;
      };
      const { data, error } = await runtimeClient.get('/api/ai/runtime/availability');
      if (error) {
        message.error((error as { message?: string } | undefined)?.message ?? '虚拟机资源检查失败');
        form.setFieldValue('requiresVirtualEnvironment', false);
        return;
      }
      const availability = data as RuntimeAvailability;
      setVmAvailability(availability);
      if (!availability.available) {
        message.warning(availability.warnings[0] ?? '当前没有可用的虚拟机资源');
        form.setFieldValue('requiresVirtualEnvironment', false);
        return;
      }
      setSelectedTools((prev) => {
        const next = prev.filter((name) => !name.startsWith('kb-'));
        for (const name of ['terminal', 'file_read', 'file_write']) {
          if (tools.some((item) => item.name === name) && !next.includes(name)) next.push(name);
        }
        return next;
      });
    } finally {
      setVmChecking(false);
    }
  };

  // 打开新增 Modal
  const handleOpenCreate = () => {
    setModalMode('create');
    resetModal();
    setModalOpen(true);
  };

  // 打开编辑 Modal
  const handleOpenEdit = async (record: AgentItem) => {
    setModalMode('edit');
    setEditingAgent(record);
    setModalOpen(true);

    // 设置表单值
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      welcomeMessage: record.welcomeMessage,
      model: record.model,
      systemPrompt: record.systemPrompt,
      isPublic: record.isPublic,
      maxIterations: record.maxIterations ?? 200,
      requiresVirtualEnvironment: record.requiresVirtualEnvironment,
      networkEnabled: record.networkEnabled !== false,
      contextCollectionEnabled: record.contextCollectionEnabled,
    });

    // 设置记忆配置
    setMemoryEnabled(record.memoryConfig?.enabled ?? true);
    setMemoryLongTerm(record.memoryConfig?.longTerm ?? false);
    setMemoryMaxHistory(record.memoryConfig?.maxHistoryMessages ?? 20);

    // 设置类型与深度研究配置
    const research = record.config?.research as
      | {
          depth?: string;
          maxIterations?: number;
          maxTokensPerTurn?: number;
          searchCount?: number;
          maxSubtasks?: number;
          maxSubtaskTurns?: number;
        }
      | undefined;
    const depth = research?.depth;
    setAgentType(depth ? 'deep_research' : 'chatbot');
    setResearchDepth(depth ?? 'normal');
    setResearchMaxIterations(research?.maxIterations);
    setResearchMaxTokens(research?.maxTokensPerTurn);
    setResearchSearchCount(research?.searchCount);
    setResearchMaxSubtasks(research?.maxSubtasks);
    setResearchMaxSubtaskTurns(research?.maxSubtaskTurns);

    // 设置轻量模型、子智能体模型、决策模型与默认思考强度
    setSummaryModel(
      typeof record.config?.summaryModel === 'string' ? record.config.summaryModel : undefined,
    );
    setApprovalModel(
      typeof record.config?.approvalModel === 'string' ? record.config.approvalModel : undefined,
    );
    setDecisionModel(
      typeof record.config?.decisionModel === 'string' ? record.config.decisionModel : undefined,
    );
    setDefaultThinkingLevel(
      typeof record.config?.defaultThinkingLevel === 'string'
        ? record.config.defaultThinkingLevel
        : 'off',
    );

    setVmAvailability(null);
    if (record.requiresVirtualEnvironment) {
      const runtimeClient = client as unknown as {
        get(path: string): Promise<{ data?: unknown; error?: unknown }>;
      };
      void runtimeClient
        .get('/api/ai/runtime/availability')
        .then(({ data }) => setVmAvailability(data as RuntimeAvailability))
        .catch(() => undefined);
    }

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

  // 组装 ai_agent.config：深度研究 + 轻量模型 + 子智能体模型 + 决策模型 + 默认思考强度
  const buildAgentConfig = (): Record<string, unknown> => ({
    ...(agentType === 'deep_research'
      ? { research: { depth: researchDepth, ...buildResearchBudget() } }
      : {}),
    ...(summaryModel ? { summaryModel } : {}),
    ...(approvalModel ? { approvalModel } : {}),
    ...(decisionModel ? { decisionModel } : {}),
    ...(defaultThinkingLevel && defaultThinkingLevel !== 'off' ? { defaultThinkingLevel } : {}),
  });

  // 校验失败时切到出错字段所在的 Tab，避免错误提示留在隐藏的 Tab 里
  const focusFirstErrorTab = (error: unknown) => {
    const first = (error as { errorFields?: Array<{ name: (string | number)[] }> })
      ?.errorFields?.[0]?.name?.[0];
    if (typeof first !== 'string') return;
    const tabKey = FIELD_TAB[first];
    if (tabKey) setActiveTab(tabKey);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const body = {
        ...agentMutationValues(values, 'create'),
        memoryConfig: {
          enabled: memoryEnabled,
          longTerm: memoryLongTerm,
          maxHistoryMessages: memoryMaxHistory,
        },
        ...(() => {
          const config = buildAgentConfig();
          return Object.keys(config).length > 0 ? { config } : {};
        })(),
        tools: selectedTools.length > 0 ? selectedTools : undefined,
        skillIds: selectedSkills.length > 0 ? selectedSkills : undefined,
        mcpServerIds: selectedMcp.length > 0 ? selectedMcp : undefined,
        knowledgeBaseIds: selectedKbs.length > 0 ? selectedKbs : undefined,
      };
      const { error } = await client.post('/api/ai/agents', { body });
      if (!error) {
        message.success('创建成功');
        setModalOpen(false);
        resetModal();
        refresh(1);
      } else {
        message.error((error as { message?: string } | undefined)?.message ?? '创建失败');
      }
    } catch (error) {
      focusFirstErrorTab(error);
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAgent) return;
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const body = {
        ...agentMutationValues(values, 'edit'),
        memoryConfig: {
          enabled: memoryEnabled,
          longTerm: memoryLongTerm,
          maxHistoryMessages: memoryMaxHistory,
        },
        config: (() => {
          const config = buildAgentConfig();
          return Object.keys(config).length > 0 ? config : null;
        })(),
        tools: selectedTools.length > 0 ? selectedTools : null,
        skillIds: selectedSkills.length > 0 ? selectedSkills : null,
        mcpServerIds: selectedMcp.length > 0 ? selectedMcp : null,
        knowledgeBaseIds: selectedKbs.length > 0 ? selectedKbs : null,
      };
      const { error } = await client.put('/api/ai/agents/:id', {
        params: { id: editingAgent.id },
        body,
      });
      if (!error) {
        message.success('更新成功');
        setModalOpen(false);
        resetModal();
        refresh();
      } else {
        message.error((error as { message?: string } | undefined)?.message ?? '更新失败');
      }
    } catch (error) {
      focusFirstErrorTab(error);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = (record: AgentItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 Agent「${record.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        const { error } = await client.delete('/api/ai/agents/:id', { params: { id: record.id } });
        if (!error) {
          message.success('删除成功');
          refresh();
        }
      },
    });
  };

  const handlePublish = async (record: AgentItem) => {
    const { error } = await client.post('/api/ai/agents/:id/publish', {
      params: { id: record.id },
    });
    if (!error) {
      message.success('发布成功');
      refresh();
    }
  };

  const columns: ColumnsType<AgentItem> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record) => (
        <a onClick={() => handleOpenEdit(record)}>
          <RobotOutlined className="mr-2" />
          {text}
        </a>
      ),
    },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 200,
      render: (models: string[]) => (
        <span className="flex flex-wrap gap-1">
          {(models ?? []).slice(0, 2).map((m) => (
            <Tag key={m} className="mr-0">
              {m}
            </Tag>
          ))}
          {(models?.length ?? 0) > 2 && <Tag className="mr-0">+{models!.length - 2}</Tag>}
        </span>
      ),
    },
    {
      title: '类型',
      key: 'type',
      width: 100,
      render: (_, record) =>
        (record.config?.research as { depth?: string } | undefined)?.depth ? (
          <Tag color="purple">深度研究</Tag>
        ) : (
          <Tag color="blue">智能问答</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { label: status, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '运行环境',
      key: 'sandboxStatus',
      width: 120,
      render: (_, record) =>
        record.requiresVirtualEnvironment ? (
          <Tag color="cyan">虚拟环境</Tag>
        ) : (
          <Tag>本机</Tag>
        ),
    },
    {
      title: '公开',
      dataIndex: 'isPublic',
      key: 'isPublic',
      width: 80,
      render: (isPublic: boolean) => (isPublic ? <Tag color="blue">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date: string) => fmtDate(date),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <ActionColumn
          items={[
            { label: '编辑', onClick: () => handleOpenEdit(record) },
            ...(record.status === 'draft'
              ? [{ label: '发布', onClick: () => handlePublish(record) }]
              : []),
            {
              label: '删除',
              onClick: () => handleDelete(record),
              danger: true,
              confirm: '确定删除？',
            },
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
            <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              创建 Agent
            </Button>
          </Space>
        }
      >
        <Space className="mb-4">
          <Input
            placeholder="搜索 Agent..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-[300px]"
            onPressEnter={handleSearch}
          />
          <Button onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, pageSize, total, onChange: handlePageChange }}
        />
      </Card>

      <Modal
        title={modalMode === 'create' ? '创建 Agent' : '编辑 Agent'}
        open={modalOpen}
        onOk={modalMode === 'create' ? handleCreate : handleUpdate}
        onCancel={() => {
          setModalOpen(false);
          resetModal();
        }}
        confirmLoading={modalLoading}
        okText={modalMode === 'create' ? '创建' : '保存'}
        cancelText="取消"
        width={960}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          className="max-h-[64vh] overflow-y-auto pr-1"
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            tabBarGutter={8}
            items={[
              {
                key: 'basic',
                label: '基础',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      label="名称"
                      name="name"
                      rules={[{ required: true, message: '请输入 Agent 名称' }]}
                    >
                      <Input placeholder="例如：智能客服助手" />
                    </Form.Item>
                    <Form.Item label="类型" tooltip="决定 Agent 的运行范式：智能问答 / 深度研究">
                      <Select
                        value={agentType}
                        onChange={setAgentType}
                        options={AGENT_TYPES.map((t) => ({
                          label: (
                            <Space orientation="vertical" size={0}>
                              <span>{t.label}</span>
                              <Text type="secondary" className="text-xs">
                                {t.description}
                              </Text>
                            </Space>
                          ),
                          value: t.value,
                        }))}
                      />
                    </Form.Item>
                    {agentType === 'deep_research' && (
                      <>
                        <Form.Item
                          label="探索强度"
                          tooltip="决定研究轮次、Token 预算与每轮检索数量"
                        >
                          <Radio.Group
                            value={researchDepth}
                            onChange={(e) => setResearchDepth(e.target.value)}
                            className="w-full"
                          >
                            <Space orientation="vertical" className="w-full">
                              {RESEARCH_DEPTHS.map((d) => (
                                <Radio key={d.value} value={d.value} className="flex items-center">
                                  <Space orientation="vertical" size={0}>
                                    <span>{d.label}</span>
                                    <Text type="secondary" className="text-xs">
                                      {d.description}
                                    </Text>
                                  </Space>
                                </Radio>
                              ))}
                            </Space>
                          </Radio.Group>
                        </Form.Item>
                        <Form.Item
                          label="自定义预算"
                          tooltip="覆盖深度预设的计算预算，留空使用预设默认值（子任务上限默认 6、单子任务轮数默认 4）"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <InputNumber
                              min={1}
                              max={200}
                              placeholder="迭代轮数（预设覆盖）"
                              value={researchMaxIterations}
                              onChange={(v) => setResearchMaxIterations(v ?? undefined)}
                              className="w-full"
                            />
                            <InputNumber
                              min={64}
                              max={128000}
                              step={256}
                              placeholder="单轮 Token（预设覆盖）"
                              value={researchMaxTokens}
                              onChange={(v) => setResearchMaxTokens(v ?? undefined)}
                              className="w-full"
                            />
                            <InputNumber
                              min={1}
                              max={20}
                              placeholder="每轮检索次数"
                              value={researchSearchCount}
                              onChange={(v) => setResearchSearchCount(v ?? undefined)}
                              className="w-full"
                            />
                            <InputNumber
                              min={1}
                              max={12}
                              placeholder="子任务数量上限"
                              value={researchMaxSubtasks}
                              onChange={(v) => setResearchMaxSubtasks(v ?? undefined)}
                              className="w-full"
                            />
                            <InputNumber
                              min={1}
                              max={10}
                              placeholder="单子任务轮数上限"
                              value={researchMaxSubtaskTurns}
                              onChange={(v) => setResearchMaxSubtaskTurns(v ?? undefined)}
                              className="w-full"
                            />
                          </div>
                          <Text type="secondary" className="text-xs">
                            留空则使用所选探索强度的预设值
                          </Text>
                        </Form.Item>
                      </>
                    )}
                    <Form.Item label="描述" name="description">
                      <TextArea rows={2} placeholder="Agent 描述（可选）" />
                    </Form.Item>
                    <Form.Item
                      label="是否公开"
                      name="isPublic"
                      valuePropName="checked"
                      initialValue={true}
                      extra="公开后所有用户可见；关闭后仅创建者与管理员可用"
                    >
                      <Switch checkedChildren="公开" unCheckedChildren="私有" />
                    </Form.Item>
                    <Form.Item
                      label="是否启用虚拟机环境"
                      name="requiresVirtualEnvironment"
                      valuePropName="checked"
                      initialValue={false}
                      tooltip="开启后按用户+Agent 创建一台持久 Linux 环境；首次对话时创建，后续复用"
                    >
                      <Switch
                        loading={vmChecking}
                        checkedChildren="启用"
                        unCheckedChildren="关闭"
                        onChange={handleVmToggle}
                      />
                    </Form.Item>
                    {requiresVm && (
                      <Alert
                        className="mb-4"
                        type={vmAvailability?.available ? 'info' : 'warning'}
                        showIcon
                        message={
                          vmAvailability
                            ? `可用宿主 ${vmAvailability.onlineHostCount}/${vmAvailability.hostCount} 台，剩余 ${vmAvailability.capacity.cpu} 核 / ${Math.round(vmAvailability.capacity.memoryMb / 1024)} GB / ${vmAvailability.capacity.slots} 槽位`
                            : '正在检查虚拟机资源…'
                        }
                        description="知识库会以只读目录注入，Agent 将使用 rg/grep/find 等命令探索；不再使用 kb-* 工具。"
                      />
                    )}
                    <Form.Item
                      label="虚拟机联网"
                      name="networkEnabled"
                      valuePropName="checked"
                      initialValue={true}
                      tooltip="开启后虚拟机可访问外网；关闭后仅保留本地文件与工具能力。默认允许。"
                    >
                      <Switch
                        disabled={!requiresVm}
                        checkedChildren="允许"
                        unCheckedChildren="禁止"
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'models',
                label: '模型配置',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      label="主模型"
                      name="model"
                      rules={[{ required: true, message: '请选择至少一个模型' }]}
                      extra="可多选，第一项为默认模型；仅可选对话类模型，JEV 请配置到下方「决策模型」"
                    >
                      <Select
                        options={modelOptions}
                        placeholder="选择模型（可多选，第一个为默认模型）"
                        mode="multiple"
                        maxTagCount="responsive"
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      label="子智能体模型"
                      tooltip="「自动审批」运行模式下负责判定工具调用是否放行的子智能体模型；留空时回退到轻量模型，两者都未配置则自动审批不可用（转人工审批）"
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="选择模型（可选，默认回退到轻量模型）"
                        value={approvalModel}
                        onChange={(v) => setApprovalModel(v)}
                        options={modelOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      label="决策模型"
                      tooltip="结构化决策模型（JEV）：模型以判断/选择/评分形式给出结构化结论，用于工具放行、意图判定等决策场景"
                      extra={
                        jevModelOptions.length === 0
                          ? '暂无可用决策模型：请先到「模型设置」添加 JEV 提供商并同步模型'
                          : undefined
                      }
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="选择 JEV 决策模型（可选）"
                        value={decisionModel}
                        onChange={(v) => setDecisionModel(v)}
                        options={jevModelOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      label="轻量模型"
                      tooltip="对话结束后调用的轻量快速模型：根据会话内容生成 20 字以内标题（Token 消耗极低）；同时作为子智能体模型的兜底。建议选择小参数模型"
                    >
                      <Select
                        allowClear
                        showSearch
                        placeholder="选择模型（可选）"
                        value={summaryModel}
                        onChange={(v) => setSummaryModel(v)}
                        options={modelOptions}
                      />
                    </Form.Item>
                    <Form.Item
                      label="默认思考强度"
                      tooltip="AI 对话中的默认思考强度；仅当所选模型支持思考时生效，不支持思考的模型自动为关闭"
                    >
                      <Select
                        value={defaultThinkingLevel}
                        onChange={setDefaultThinkingLevel}
                        options={[
                          { label: '关闭（默认）', value: 'off' },
                          { label: 'Minimal', value: 'minimal' },
                          { label: 'Low', value: 'low' },
                          { label: 'Medium', value: 'medium' },
                          { label: 'High', value: 'high' },
                          { label: 'XHigh', value: 'xhigh' },
                        ]}
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'session',
                label: '会话配置',
                forceRender: true,
                children: (
                  <>
                    <Form.Item
                      label="系统提示词"
                      name="systemPrompt"
                      rules={[{ required: true, message: '请输入系统提示词' }]}
                    >
                      <TextArea
                        rows={10}
                        placeholder="定义 Agent 的行为、角色和能力边界..."
                        className="font-mono"
                      />
                    </Form.Item>
                    <Form.Item
                      label="欢迎词"
                      name="welcomeMessage"
                      extra="新会话空态展示；留空使用默认欢迎词"
                    >
                      <TextArea
                        rows={2}
                        maxLength={500}
                        showCount
                        placeholder="有什么可以帮助你的？"
                      />
                    </Form.Item>
                    <Form.Item
                      label="是否开启上下文采集"
                      name="contextCollectionEnabled"
                      valuePropName="checked"
                      initialValue={false}
                      tooltip="记录该 Agent 每次模型请求装配出的上下文（系统提示 / 工具 schema / 各分桶消息）。属调试信息，仅管理员可在对话内查看，默认关闭"
                    >
                      <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                    <Form.Item
                      label="最大迭代轮数"
                      name="maxIterations"
                      tooltip="Agent 单次对话中允许的最多工具调用轮次；-1 表示无上限（默认 200）"
                    >
                      <InputNumber
                        min={-1}
                        max={10000}
                        className="w-full"
                        placeholder="默认 200，-1 表示无上限"
                      />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'memory',
                label: '记忆配置',
                forceRender: true,
                children: (
                  <div className="max-w-[680px]">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <Text strong>是否开启长期记忆</Text>
                        <div>
                          <Text type="secondary" className="text-xs">
                            注入用户长期记忆摘要，跨会话记住用户偏好与关键事实
                          </Text>
                        </div>
                      </div>
                      <Switch checked={memoryLongTerm} onChange={setMemoryLongTerm} />
                    </div>
                    <Divider className="my-4" />
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <Text strong>是否启用对话记忆</Text>
                        <div>
                          <Text type="secondary" className="text-xs">
                            读写会话历史，按用户隔离
                          </Text>
                        </div>
                      </div>
                      <Switch checked={memoryEnabled} onChange={setMemoryEnabled} />
                    </div>
                    <Divider className="my-4" />
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <Text strong>历史消息数</Text>
                        <div>
                          <Text type="secondary" className="text-xs">
                            单次对话加载的历史消息条数上限，越大上下文越完整、Token 消耗越高
                          </Text>
                        </div>
                      </div>
                      <InputNumber
                        min={1}
                        max={100}
                        disabled={!memoryEnabled}
                        value={memoryMaxHistory}
                        onChange={(v) => setMemoryMaxHistory(v ?? 20)}
                        className="w-[120px]"
                        suffix="条"
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'tools',
                label: '工具启用配置',
                children: (
                  <div className="pt-2">
                    <AbilityPanel
                      title="内置工具"
                      icon={<ToolOutlined />}
                      items={requiresVm ? tools.filter((item) => !item.name.startsWith('kb-')) : tools}
                      selected={selectedTools}
                      onChange={setSelectedTools}
                      renderItem={(item) => (
                        <div>
                          <div className="font-medium text-[13px]">{item.name}</div>
                          {item.description && (
                            <Text type="secondary" className="text-xs">
                              {item.description}
                            </Text>
                          )}
                        </div>
                      )}
                    />
                  </div>
                ),
              },
              {
                key: 'skills',
                label: '技能启用配置',
                children: (
                  <div className="pt-2">
                    <AbilityPanel
                      title="技能"
                      icon={<BlockOutlined />}
                      items={skills.map((s) => ({ ...s, disabled: !s.enabled }))}
                      selected={selectedSkills}
                      onChange={setSelectedSkills}
                      renderItem={(item) => (
                        <div>
                          <Space>
                            <Text strong className="text-[13px]">
                              {item.name}
                            </Text>
                            {!item.enabled && (
                              <Tag color="red" className="text-[11px]">
                                已禁用
                              </Tag>
                            )}
                          </Space>
                          {item.description && (
                            <div>
                              <Text type="secondary" className="text-xs">
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
                key: 'mcp',
                label: 'MCP 启用配置',
                children: (
                  <div className="pt-2">
                    <AbilityPanel
                      title="MCP 服务"
                      icon={<ThunderboltOutlined />}
                      items={mcpServers.map((m) => ({
                        id: m.id,
                        name: m.name,
                        description: m.description,
                        disabled: m.status !== 'connected',
                      }))}
                      selected={selectedMcp}
                      onChange={setSelectedMcp}
                      renderItem={(item) => {
                        const mcp = mcpServers.find((m) => m.id === item.id);
                        return (
                          <div>
                            <Space>
                              <Text strong className="text-[13px]">
                                {item.name}
                              </Text>
                              {mcp && (
                                <Tag
                                  color={mcp.status === 'connected' ? 'green' : 'red'}
                                  className="text-[11px]"
                                >
                                  {mcp.status === 'connected' ? '已连接' : '未连接'}
                                </Tag>
                              )}
                              {mcp && mcp.toolCount > 0 && (
                                <Tag className="text-[11px]">{mcp.toolCount} 工具</Tag>
                              )}
                            </Space>
                            {item.description && (
                              <div>
                                <Text type="secondary" className="text-xs">
                                  {item.description}
                                </Text>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>
                ),
              },
              {
                key: 'kb',
                label: '知识库启用配置',
                children: (
                  <div className="pt-2">
                    <AbilityPanel
                      title="知识库"
                      icon={<BookOutlined />}
                      items={knowledgeBases}
                      selected={selectedKbs}
                      onChange={setSelectedKbs}
                      renderItem={(item) => (
                        <div>
                          <Text strong className="text-[13px]">
                            {item.name}
                          </Text>
                          {item.description && (
                            <div>
                              <Text type="secondary" className="text-xs">
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
            ]}
          />
        </Form>
      </Modal>
    </>
  );
};

export default AgentsPage;
