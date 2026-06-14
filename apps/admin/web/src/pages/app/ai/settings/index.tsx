/**
 * AI 配置页面 — 供应商管理、模型目录、默认模型设置
 */
import { client } from "@/api";
import { msg } from "@/components/GlobalMessage";
import {
  ApiOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PictureOutlined,
  AudioOutlined,
  VideoCameraOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  StarFilled,
  StarOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  InputNumber,
  Divider,
  Badge,
  Descriptions,
  Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import ActionColumn from "@/components/ActionColumn";

const { Title, Text } = Typography;

interface ProviderPreset {
  id: string;
  name: string;
  displayName: string;
  apiFormat: string;
  baseUrl: string;
  description: string;
  modelsDevSlug?: string;
}

interface ProviderItem {
  id: string;
  name: string;
  displayName: string | null;
  apiFormat: string;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string> | null;
  extra: Record<string, unknown> | null;
  presetId: string | null;
  modelsDevSlug: string | null;
  status: number;
  sort: number;
  modelCount: number;
  createdAt: string;
  updatedAt: string;
}

// 推理选项类型（与 models.dev reasoning_options 兼容）
interface ReasoningToggle { type: "toggle" }
interface ReasoningEffort { type: "effort"; values: string[] }
interface ReasoningBudgetTokens { type: "budget_tokens"; min?: number; max?: number }
type ReasoningOption = ReasoningToggle | ReasoningEffort | ReasoningBudgetTokens;

interface ModelItem {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string | null;
  contextLength: number;
  maxOutputTokens: number;
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsStructuredOutput: boolean;
  reasoningOptions: ReasoningOption[] | null;
  pricingInput: number | null;
  pricingOutput: number | null;
  autoFetched: boolean;
  status: number;
  sort: number;
}

const FORMAT_LABELS: Record<string, { label: string; color: string }> = {
  openai_chat: { label: "OpenAI Chat", color: "green" },
  openai_response: { label: "OpenAI Response", color: "blue" },
  anthropic: { label: "Anthropic", color: "purple" },
  custom: { label: "自定义", color: "default" },
};

function CapIcons({ model }: { model: ModelItem }) {
  const icons: React.ReactNode[] = [];
  if (model.supportsImage) icons.push(<Tooltip key="img" title="图片"><PictureOutlined style={{ color: "#1677ff" }} /></Tooltip>);
  if (model.supportsVideo) icons.push(<Tooltip key="vid" title="视频"><VideoCameraOutlined style={{ color: "#722ed1" }} /></Tooltip>);
  if (model.supportsAudio) icons.push(<Tooltip key="aud" title="语音"><AudioOutlined style={{ color: "#eb2f96" }} /></Tooltip>);
  if (model.supportsFunctionCalling) icons.push(<Tooltip key="fn" title="函数调用"><CodeOutlined style={{ color: "#52c41a" }} /></Tooltip>);
  if (model.supportsThinking) {
    const opts = model.reasoningOptions;
    let thinkTip = "推理/思考";
    if (opts && opts.length > 0) {
      const parts = opts.map(o => {
        if (o.type === "toggle") return "开关";
        if (o.type === "effort") return `强度: ${o.values.join(", ")}`;
        if (o.type === "budget_tokens") return `预算: ${o.min ?? 0}~${o.max ?? "∞"}`;
        return o.type;
      });
      thinkTip = `推理/思考 — ${parts.join(" + ")}`;
    }
    icons.push(<Tooltip key="think" title={thinkTip}><ThunderboltOutlined style={{ color: "#fa8c16" }} /></Tooltip>);
  }
  if (model.supportsStructuredOutput) icons.push(<Tooltip key="struct" title="结构化输出"><CheckCircleOutlined style={{ color: "#13c2c2" }} /></Tooltip>);
  return <Space size={4}>{icons}</Space>;
}

export default function AISettingsPage() {
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultModel, setDefaultModel] = useState<string>("");

  // Add provider modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Edit provider drawer
  const [editOpen, setEditOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<ProviderItem | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // Models drawer
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsProvider, setModelsProvider] = useState<ProviderItem | null>(null);
  const [modelsList, setModelsList] = useState<ModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [testingModels, setTestingModels] = useState<Set<string>>(new Set());
  const [modelTestResults, setModelTestResults] = useState<Record<string, { status: string; elapsed?: number; message?: string }>>({});

  // Add model modal
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [addModelForm] = Form.useForm();
  const [addModelLoading, setAddModelLoading] = useState(false);

  // OCR config
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [ocrLanguage, setOcrLanguage] = useState("chi_sim+eng");
  const [ocrServerUrl, setOcrServerUrl] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);

  // Edit model modal
  const [editModelOpen, setEditModelOpen] = useState(false);
  const [editModel, setEditModel] = useState<ModelItem | null>(null);
  const [editModelForm] = Form.useForm();

  // === Fetch ===
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = await client.get("/api/ai/providers") as { error?: unknown; data?: ProviderItem[] };
      if (!error && data) setProviders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    try {
      const { error, data } = await client.get("/api/ai/providers/presets") as { error?: unknown; data?: ProviderPreset[] };
      if (!error && data) setPresets(data);
    } catch {}
  }, []);

  const fetchOcrConfig = useCallback(async () => {
    try {
      const [enabledRes, langRes, serverUrlRes] = await Promise.all([
        client.get("/api/ai/config/:key", { params: { key: "ocr_enabled" } }) as Promise<{ error?: unknown; data?: { value: string | null } }>,
        client.get("/api/ai/config/:key", { params: { key: "ocr_language" } }) as Promise<{ error?: unknown; data?: { value: string | null } }>,
        client.get("/api/ai/config/:key", { params: { key: "ocr_server_url" } }) as Promise<{ error?: unknown; data?: { value: string | null } }>,
      ]);
      if (!enabledRes.error && enabledRes.data?.value !== undefined) {
        setOcrEnabled(enabledRes.data.value !== "false");
      }
      if (!langRes.error && langRes.data?.value) {
        setOcrLanguage(langRes.data.value);
      }
      if (!serverUrlRes.error && serverUrlRes.data?.value) {
        setOcrServerUrl(serverUrlRes.data.value);
      }
    } catch {}
  }, []);

  const saveOcrConfig = useCallback(async (key: string, value: string) => {
    await client.put("/api/ai/config/:key", { params: { key }, body: { value } });
  }, []);

  const fetchDefaultModel = useCallback(async () => {
    try {
      const { data } = await client.get("/api/ai/config/:key", { params: { key: "default_model" } }) as { data?: { value: string | null } };
      if (data?.value) setDefaultModel(data.value);
    } catch {}
  }, []);

  useEffect(() => {
    fetchProviders();
    fetchPresets();
    fetchDefaultModel();
    fetchOcrConfig();
  }, [fetchProviders, fetchPresets, fetchDefaultModel]);

  // === Set default model ===
  const handleSetDefault = useCallback(async (providerName: string, modelId: string) => {
    const key = `${providerName}/${modelId}`;
    const { error } = await client.put("/api/ai/config/:key", {
      params: { key: "default_model" },
      body: { value: key },
    });
    if (!error) {
      setDefaultModel(key);
      msg.success("已设为默认模型");
    }
  }, []);

  const handleClearDefault = useCallback(async () => {
    const { error } = await client.put("/api/ai/config/:key", {
      params: { key: "default_model" },
      body: { value: "" },
    });
    if (!error) {
      setDefaultModel("");
      msg.success("已取消默认模型");
    }
  }, []);

  // === Add provider ===
  const handleAddProvider = async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      const preset = presets.find((p) => p.id === values.presetId);
      const body: Record<string, unknown> = {
        name: preset?.name ?? `custom_${Date.now()}`,
        displayName: values.providerDisplayName || preset?.displayName || "自定义供应商",
        apiFormat: preset?.apiFormat ?? values.customApiFormat,
        baseUrl: preset?.baseUrl || values.customBaseUrl,
        apiKey: values.apiKey,
        presetId: preset?.id ?? null,
        modelsDevSlug: preset?.modelsDevSlug ?? (values.customModelsDevSlug || undefined),
      };
      const { error } = await client.post("/api/ai/providers", { body });
      if (!error) {
        msg.success("供应商添加成功");
        setAddOpen(false);
        addForm.resetFields();
        setSelectedPreset(null);
        fetchProviders();
      }
    } catch {} finally {
      setAddLoading(false);
    }
  };

  // === Edit provider ===
  const openEdit = (p: ProviderItem) => {
    setEditProvider(p);
    editForm.setFieldsValue({
      displayName: p.displayName,
      apiFormat: p.apiFormat,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      modelsDevSlug: p.modelsDevSlug,
      status: p.status,
      sort: p.sort,
    });
    setEditOpen(true);
  };

  const handleEditProvider = async () => {
    if (!editProvider) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const { error } = await client.put("/api/ai/providers/:id", {
        params: { id: editProvider.id },
        body: values,
      });
      if (!error) {
        msg.success("更新成功");
        setEditOpen(false);
        fetchProviders();
      }
    } catch {} finally {
      setEditLoading(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    const { error } = await client.delete("/api/ai/providers/:id", { params: { id } });
    if (!error) {
      msg.success("已删除");
      fetchProviders();
    }
  };

  // === Models drawer ===
  const openModels = async (p: ProviderItem) => {
    setModelsProvider(p);
    setModelsOpen(true);
    setModelsLoading(true);
    setSelectedModelIds([]);
    setModelTestResults({});
    try {
      const [modelsRes, defaultRes] = await Promise.all([
        client.get("/api/ai/providers/:id/models", { params: { id: p.id } }) as Promise<{ data?: ModelItem[] }>,
        client.get("/api/ai/config/:key", { params: { key: "default_model" } }) as Promise<{ data?: { value: string | null } }>,
      ]);
      if (modelsRes.data) setModelsList(modelsRes.data);
      if (defaultRes.data?.value) setDefaultModel(defaultRes.data.value);
      else setDefaultModel("");
    } finally {
      setModelsLoading(false);
    }
  };

  const refreshModels = async () => {
    if (!modelsProvider) return;
    setModelsLoading(true);
    try {
      const { data } = await client.get("/api/ai/providers/:id/models", { params: { id: modelsProvider.id } }) as { data?: ModelItem[] };
      if (data) setModelsList(data);
    } finally {
      setModelsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!modelsProvider) return;
    setSyncing(true);
    try {
      const { error, data } = await client.post("/api/ai/providers/:id/sync", { params: { id: modelsProvider.id } }) as {
        error?: unknown;
        data?: { added: number; updated: number; removed: number; total: number };
      };
      if (!error && data) {
        msg.success(`同步完成：新增 ${data.added}，更新 ${data.updated}，移除 ${data.removed}，共 ${data.total} 个模型`);
        await refreshModels();
        fetchProviders();
      }
    } catch (e) {
      msg.error("同步失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setSyncing(false);
    }
  };

  // === Edit model ===
  const openEditModel = (m: ModelItem) => {
    setEditModel(m);
    // Extract effort and budget values from reasoningOptions for the form
    const effortOpt = m.reasoningOptions?.find((o) => o.type === "effort") as ReasoningEffort | undefined;
    const budgetOpt = m.reasoningOptions?.find((o) => o.type === "budget_tokens") as ReasoningBudgetTokens | undefined;
    const formValues = {
      ...m,
      effortValues: effortOpt?.values ?? [],
      budgetMin: budgetOpt?.min,
      budgetMax: budgetOpt?.max,
    };
    editModelForm.setFieldsValue(formValues);
    setEditModelOpen(true);
  };

  const handleDeleteModel = async (modelId: string) => {
    const { error } = await client.delete("/api/ai/models/:id", { params: { id: modelId } });
    if (!error) {
      msg.success("模型已删除");
      await refreshModels();
    }
  };

  // === Add model (manual) ===
  const handleAddModel = async () => {
    if (!modelsProvider) return;
    try {
      const values = await addModelForm.validateFields();
      setAddModelLoading(true);
      // Reconstruct reasoningOptions from effortValues + budget fields
      const parts: ReasoningOption[] = [];
      const effortValues: string[] | undefined = values.effortValues;
      if (effortValues && effortValues.length > 0) {
        parts.push({ type: "effort", values: effortValues.map((v: string) => v.toLowerCase().trim()).filter(Boolean) });
      }
      const budgetMin: number | undefined = values.budgetMin;
      const budgetMax: number | undefined = values.budgetMax;
      if (budgetMin != null || budgetMax != null) {
        parts.push({ type: "budget_tokens", ...(budgetMin != null ? { min: budgetMin } : {}), ...(budgetMax != null ? { max: budgetMax } : {}) });
      }
      const reasoningOptions = parts.length > 0 ? parts : null;
      const { effortValues: _e, budgetMin: _bmin, budgetMax: _bmax, ...body } = values;
      const { error } = await client.post("/api/ai/providers/:id/models", {
        params: { id: modelsProvider.id },
        body: { ...body, reasoningOptions },
      });
      if (!error) {
        msg.success("模型已添加");
        setAddModelOpen(false);
        addModelForm.resetFields();
        await refreshModels();
      }
    } catch {} finally {
      setAddModelLoading(false);
    }
  };

  // === Batch delete ===
  const handleBatchDelete = async () => {
    if (selectedModelIds.length === 0) return;
    const { error, data } = await client.post("/api/ai/models/batch-delete", {
      body: { ids: selectedModelIds },
    }) as { error?: unknown; data?: { deleted: number } };
    if (!error) {
      msg.success(`已删除 ${data?.deleted ?? selectedModelIds.length} 个模型`);
      setSelectedModelIds([]);
      await refreshModels();
    }
  };

  // === Test connectivity (single) ===
  const handleTestModel = async (modelId: string) => {
    setTestingModels((prev) => new Set(prev).add(modelId));
    setModelTestResults((prev) => ({ ...prev, [modelId]: undefined as unknown as { status: string } }));
    try {
      const { data } = await client.post("/api/ai/models/:id/test", {
        params: { id: modelId },
      }) as { data?: { status: string; elapsed?: number; message?: string; statusCode?: number } };
      if (data) {
        setModelTestResults((prev) => ({ ...prev, [modelId]: data }));
        if (data.status === "ok") {
          msg.success(`连通性测试通过 (${data.elapsed}ms)`);
        } else {
          msg.error(`连通性测试失败: ${data.message ?? "HTTP " + data.statusCode}`);
        }
      }
    } catch (e) {
      const result = { status: "error", message: e instanceof Error ? e.message : "测试失败" };
      setModelTestResults((prev) => ({ ...prev, [modelId]: result }));
      msg.error(result.message);
    } finally {
      setTestingModels((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  // === Batch test ===
  const handleBatchTest = async () => {
    if (selectedModelIds.length === 0) return;
    msg.loading(`正在测试 ${selectedModelIds.length} 个模型...`);
    setTestingModels(new Set(selectedModelIds));
    try {
      const { data } = await client.post("/api/ai/models/batch-test", {
        body: { ids: selectedModelIds },
      }) as { data?: Array<{ id: string; status: string; elapsed?: number; message?: string }> };
      if (data) {
        const results: Record<string, { status: string; elapsed?: number; message?: string }> = {};
        let ok = 0;
        let fail = 0;
        for (const r of data) {
          results[r.id] = r;
          if (r.status === "ok") ok++;
          else fail++;
        }
        setModelTestResults((prev) => ({ ...prev, ...results }));
        msg.success(`测试完成：${ok} 通过，${fail} 失败`);
      }
    } catch (e) {
      msg.error("批量测试失败: " + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setTestingModels(new Set());
    }
  };

  const handleEditModel = async () => {
    if (!editModel) return;
    try {
      const values = await editModelForm.validateFields();
      // Reconstruct reasoningOptions from effortValues + budget fields
      let reasoningOptions: ReasoningOption[] | null = null;
      const effortValues: string[] | undefined = values.effortValues;
      const budgetMin: number | undefined = values.budgetMin;
      const budgetMax: number | undefined = values.budgetMax;
      const existing = editModel.reasoningOptions ?? [];
      const parts: ReasoningOption[] = [];
      // Keep toggle entries from existing
      for (const opt of existing) {
        if (opt.type === "toggle") parts.push(opt);
      }
      // Add effort (normalized to lowercase)
      if (effortValues && effortValues.length > 0) {
        parts.push({ type: "effort", values: effortValues.map((v: string) => v.toLowerCase().trim()).filter(Boolean) });
      }
      // Add budget_tokens if min or max is set
      if (budgetMin != null || budgetMax != null) {
        parts.push({ type: "budget_tokens", ...(budgetMin != null ? { min: budgetMin } : {}), ...(budgetMax != null ? { max: budgetMax } : {}) });
      }
      if (parts.length > 0) reasoningOptions = parts;
      // Remove form-only fields from body
      const { effortValues: _e, budgetMin: _bmin, budgetMax: _bmax, ...rest } = values;
      const body = { ...rest, reasoningOptions };
      const { error } = await client.put("/api/ai/models/:id", {
        params: { id: editModel.id },
        body,
      });
      if (!error) {
        msg.success("模型已更新");
        setEditModelOpen(false);
        await refreshModels();
      }
    } catch {}
  };

  // === Preset selector options ===
  const presetOptions = presets.map((p) => ({
    value: p.id,
    label: `${p.displayName}  —  ${p.description}`,
  }));

  // === Sort models: default first ===
  const isDefaultModel = useCallback((providerName: string, modelId: string) => {
    return defaultModel === `${providerName}/${modelId}`;
  }, [defaultModel]);

  // === Model table columns (inside models drawer) ===
  const modelColumns: ColumnsType<ModelItem> = [
    {
      title: "模型 ID",
      dataIndex: "modelId",
      key: "modelId",
      width: 'min-content',
      fixed: 'left',
      sorter: (a, b) => {
        const aDefault = isDefaultModel(modelsProvider?.name ?? "", a.modelId) ? 0 : 1;
        const bDefault = isDefaultModel(modelsProvider?.name ?? "", b.modelId) ? 0 : 1;
        if (aDefault !== bDefault) return aDefault - bDefault;
        return (a.displayName || a.modelId).localeCompare(b.displayName || b.modelId);
      },
      defaultSortOrder: "ascend",
      render: (text: string, r) => {
        const isDefault = isDefaultModel(modelsProvider?.name ?? "", r.modelId);
        return (
          <Space>
            {isDefault && <StarFilled style={{ color: "#faad14", fontSize: 14 }} />}
            <Text strong>{r.displayName || text}</Text>
            {isDefault && <Tag color="gold">默认</Tag>}
            {r.autoFetched && <Tag color="blue" style={{ fontSize: 10 }}>自动</Tag>}
          </Space>
        );
      },
    },
    {
      title: "上下文",
      dataIndex: "contextLength",
      key: "contextLength",
      width: 90,
      render: (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`,
    },
    {
      title: "输出上限",
      dataIndex: "maxOutputTokens",
      key: "maxOutputTokens",
      width: 90,
      render: (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v),
    },
    {
      title: "能力",
      key: "caps",
      width: 110,
      render: (_, r) => <CapIcons model={r} />,
    },
    {
      title: "价格 ($/M)",
      key: "price",
      width: 120,
      render: (_, r) => r.pricingInput != null && r.pricingInput > 0
        ? <Text type="secondary" style={{ fontSize: 12 }}>${r.pricingInput} / ${r.pricingOutput}</Text>
        : <Tooltip title="点击编辑按钮手动填写价格"><Text type="secondary" style={{ cursor: "pointer", fontSize: 11 }}>未设置</Text></Tooltip>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 70,
      render: (v: number) => <Tag color={v === 1 ? "green" : "red"}>{v === 1 ? "启用" : "禁用"}</Tag>,
    },
    {
      title: "操作",
      key: "action",
      width: 'min-content',
      fixed: 'right',
      render: (_, r) => {
        const isDefault = isDefaultModel(modelsProvider?.name ?? "", r.modelId);
        return (
          (() => {
            const testResult = modelTestResults[r.id];
            const testLabel = testingModels.has(r.id) ? "测试中..." : testResult?.status === "ok" ? `✓ ${testResult.elapsed}ms` : testResult?.status === "error" ? "✗ 失败" : "测试";
            const items: Array<{ label: string; onClick: () => void; danger?: boolean; confirm?: string }> = [
              isDefault
                ? { label: "取消默认", onClick: handleClearDefault }
                : { label: "设为默认", onClick: () => handleSetDefault(modelsProvider?.name ?? "", r.modelId) },
              { label: testLabel, onClick: () => handleTestModel(r.id) },
              { label: "编辑", onClick: () => openEditModel(r) },
              { label: "删除", onClick: () => handleDeleteModel(r.id), danger: true, confirm: "确定删除此模型？" },
            ];
            return <ActionColumn items={items} maxInline={3} />;
          })()
        );
      },
    },
  ];

  // === Provider table columns ===
  const providerColumns: ColumnsType<ProviderItem> = [
    {
      title: "供应商",
      key: "name",
      width: 220,
      render: (_, r) => (
        <Space>
          <span style={{ fontWeight: 600 }}>{r.displayName || r.name}</span>
          <Tag color={FORMAT_LABELS[r.apiFormat]?.color ?? "default"}>
            {FORMAT_LABELS[r.apiFormat]?.label ?? r.apiFormat}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Base URL",
      dataIndex: "baseUrl",
      key: "baseUrl",
      ellipsis: true,
      render: (v: string) => <Text type="secondary">{v}</Text>,
    },
    {
      title: "模型数",
      dataIndex: "modelCount",
      key: "modelCount",
      width: 80
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (v: number) => <Tag color={v === 1 ? "green" : "red"}>{v === 1 ? "启用" : "禁用"}</Tag>,
    },
    {
      title: "操作",
      key: "action",
      width: 132,
      fixed: 'right',
      render: (_, r) => (
        <ActionColumn items={[
          { label: '模型', onClick() {
            openModels(r)
          },},
          { label: '编辑', onClick() {
            openEdit(r)
          },},
          { label: '删除', danger: true, confirm: '确定删除此供应商及其所有模型？', onClick() {
            handleDeleteProvider(r.id)
          },},
        ]} />
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>
        <SettingOutlined style={{ marginRight: 8 }} />
        AI 配置
      </Title>

      <Tabs
        defaultActiveKey="providers"
        items={[
          {
            key: "providers",
            label: <Space><ApiOutlined /> 供应商管理</Space>,
            children: (
              <Card
                extra={
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchProviders}>刷新</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加供应商</Button>
                  </Space>
                }
              >
        <Table
          rowKey="id"
          columns={providerColumns}
          dataSource={providers}
          loading={loading}
          size="small"
          pagination={false}
        />
              </Card>
            ),
          },
          {
            key: "ocr",
            label: <Space><RobotOutlined /> OCR 配置</Space>,
            children: (
              <Card title="OCR 设置" style={{ marginTop: 0 }}>
                <div style={{ marginBottom: 16, padding: "8px 12px", background: "#e6f4ff", borderRadius: 6, fontSize: 13 }}>
                  💡 OCR（光学字符识别）用于解析扫描版 PDF 文件。开启后，上传 PDF 时会自动调用内置 Tesseract 引擎识别文字。也可配置远程 PaddleOCR 服务以获得更好的中文识别效果。
                </div>
                <Row gutter={24}>
                  <Col span={12}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>启用 OCR</div>
                      <Switch
                        checked={ocrEnabled}
                        onChange={async (checked) => {
                          setOcrEnabled(checked);
                          await saveOcrConfig("ocr_enabled", String(checked));
                          msg.success(checked ? "OCR 已启用" : "OCR 已禁用");
                        }}
                      />
                      <Text type="secondary" style={{ marginLeft: 12 }}>
                        解析扫描版 PDF 时自动调用 OCR 引擎
                      </Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>OCR 语言</div>
                      <Select
                        value={ocrLanguage}
                        style={{ width: 240 }}
                        onChange={async (val) => {
                          setOcrLanguage(val);
                          await saveOcrConfig("ocr_language", val);
                          msg.success("OCR 语言已更新");
                        }}
                        options={[
                          { value: "chi_sim+eng", label: "简体中文 + 英文" },
                          { value: "chi_tra+eng", label: "繁体中文 + 英文" },
                          { value: "eng", label: "仅英文" },
                          { value: "jpn+eng", label: "日文 + 英文" },
                          { value: "kor+eng", label: "韩文 + 英文" },
                        ]}
                      />
                    </div>
                  </Col>
                </Row>
                <Divider style={{ margin: "8px 0 16px" }} />
                <div style={{ marginBottom: 8, fontWeight: 500 }}>远程 PaddleOCR 服务</div>
                <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff7e6", borderRadius: 6, fontSize: 13 }}>
                  💡 配置远程 PaddleOCR 服务地址后，将优先使用该服务进行 OCR 识别，适用于需要更高中文识别精度的场景。留空则使用本地 Tesseract 引擎。
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}>PaddleOCR 服务地址</div>
                  <Input
                    value={ocrServerUrl}
                    placeholder="http://paddleocr:8866/predict/ocr_system"
                    style={{ maxWidth: 480 }}
                    onChange={(e) => setOcrServerUrl(e.target.value)}
                    onBlur={async () => {
                      await saveOcrConfig("ocr_server_url", ocrServerUrl);
                      msg.success(ocrServerUrl ? "PaddleOCR 服务地址已更新" : "已清除 PaddleOCR 服务地址");
                    }}
                    allowClear
                  />
                  <Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                    留空表示使用本地 Tesseract 引擎。填写后将通过远程 PaddleOCR 服务识别。
                  </Text>
                </div>
              </Card>
            ),
          },
        ]}
      />

      {/* === Add Provider Modal === */}
      <Modal
        title="添加供应商"
        open={addOpen}
        onOk={handleAddProvider}
        onCancel={() => { setAddOpen(false); setSelectedPreset(null); addForm.resetFields(); }}
        confirmLoading={addLoading}
        destroyOnHidden
        width={640}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="presetId" label="选择预设" rules={[{ required: true, message: "请选择供应商预设" }]}>
            <Select
              placeholder="选择供应商预设..."
              options={presetOptions}
              onChange={(val) => {
                const preset = presets.find((p) => p.id === val) ?? null;
                setSelectedPreset(preset);
                if (preset && !preset.baseUrl) {
                  addForm.setFieldsValue({ customApiFormat: preset.apiFormat });
                }
              }}
              showSearch
              filterOption={(input, option) => {
                const p = presets.find((pp) => pp.id === option?.value);
                return p ? `${p.displayName} ${p.name} ${p.description}`.toLowerCase().includes(input.toLowerCase()) : false;
              }}
            />
          </Form.Item>

          {selectedPreset && !selectedPreset.baseUrl && (
            <>
              <Form.Item name="customBaseUrl" label="Base URL" rules={[{ required: true }]}>
                <Input placeholder="https://api.example.com/v1" />
              </Form.Item>
              <Form.Item name="customApiFormat" label="API 格式">
                <Select options={[
                  { value: "openai_chat", label: "OpenAI Chat Completions" },
                  { value: "openai_response", label: "OpenAI Response" },
                  { value: "anthropic", label: "Anthropic Messages" },
                  { value: "custom", label: "自定义" },
                ]} />
              </Form.Item>
              <Form.Item name="customModelsDevSlug" label="models.dev 供应商名称" extra="填写后可从 models.dev 同步模型列表，如 anthropic, openai, deepseek">
                <Input placeholder="如 anthropic" />
              </Form.Item>
            </>
          )}

          {selectedPreset && selectedPreset.baseUrl && (
            <div style={{ marginBottom: 16, padding: 12, background: "#f6f8fa", borderRadius: 8 }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="供应商">{selectedPreset.displayName}</Descriptions.Item>
                <Descriptions.Item label="API 格式">
                  <Tag color={FORMAT_LABELS[selectedPreset.apiFormat]?.color}>
                    {FORMAT_LABELS[selectedPreset.apiFormat]?.label}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Base URL">{selectedPreset.baseUrl}</Descriptions.Item>
              </Descriptions>
            </div>
          )}

          <Form.Item
            name="providerDisplayName"
            label="显示名称"
            extra="用于区分同一供应商的不同实例，如「DeepSeek 个人」和「DeepSeek 公司」"
            initialValue={selectedPreset?.displayName}
            key={selectedPreset?.id}
          >
            <Input placeholder="如 DeepSeek 个人" />
          </Form.Item>

          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: "请输入 API Key" }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* === Edit Provider Drawer === */}
      <Drawer
        title={`编辑供应商 — ${editProvider?.displayName || editProvider?.name}`}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={520}
        extra={
          <Button type="primary" icon={<SaveOutlined />} loading={editLoading} onClick={handleEditProvider}>
            保存
          </Button>
        }
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="displayName" label="显示名称">
            <Input />
          </Form.Item>
          <Form.Item name="apiFormat" label="API 格式">
            <Select options={[
              { value: "openai_chat", label: "OpenAI Chat Completions" },
              { value: "openai_response", label: "OpenAI Response" },
              { value: "anthropic", label: "Anthropic Messages" },
              { value: "custom", label: "自定义" },
            ]} />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password />
          </Form.Item>
          <Form.Item name="modelsDevSlug" label="models.dev 供应商名称" extra="填写后可从 models.dev 同步模型列表，如 anthropic, openai, deepseek">
            <Input placeholder="留空则不同步" allowClear />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 1, label: "启用" },
                  { value: 0, label: "禁用" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序">
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* === Models Drawer === */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>模型管理 — {modelsProvider?.displayName || modelsProvider?.name}</span>
            {defaultModel && defaultModel.startsWith((modelsProvider?.name ?? "") + "/") && (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                当前默认: <Text strong>{defaultModel.split("/").slice(1).join("/")}</Text>
              </Text>
            )}
          </Space>
        }
        open={modelsOpen}
        onClose={() => { setModelsOpen(false); setSelectedModelIds([]); setModelTestResults({}); }}
        size={960}
        extra={
          <Space>
            {(modelsProvider?.presetId || modelsProvider?.modelsDevSlug) && (
              <Button icon={<CloudSyncOutlined />} loading={syncing} onClick={handleSync}>
                从 models.dev 同步
              </Button>
            )}
            <Button icon={<PlusOutlined />} onClick={() => { addModelForm.resetFields(); setAddModelOpen(true); }}>
              添加模型
            </Button>
            <Button icon={<ReloadOutlined />} onClick={refreshModels}>刷新</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16, padding: "8px 12px", background: "#e6f4ff", borderRadius: 6, fontSize: 13 }}>
          💡 {(modelsProvider?.presetId || modelsProvider?.modelsDevSlug) ? "点击「从 models.dev 同步」自动拉取模型列表，或点击「添加模型」手动添加。" : "点击「添加模型」手动添加模型。"} 勾选模型后可批量删除或测试连通性。
        </div>
        {selectedModelIds.length > 0 && (
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <Text type="secondary">已选 {selectedModelIds.length} 个模型</Text>
            <Popconfirm
              title={`确定删除选中的 ${selectedModelIds.length} 个模型？`}
              onConfirm={handleBatchDelete}
              okText="删除"
              okType="danger"
            >
              <Button size="small" danger icon={<DeleteOutlined />}>批量删除</Button>
            </Popconfirm>
            <Button size="small" icon={<ThunderboltOutlined />} onClick={handleBatchTest}>
              批量测试连通性
            </Button>
            <Button size="small" type="link" onClick={() => setSelectedModelIds([])}>取消选择</Button>
          </div>
        )}
        <Table
          rowKey="id"
          columns={modelColumns}
          dataSource={modelsList}
          loading={modelsLoading}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={modelsList.length > 20 ? { pageSize: 20 } : false}
          rowSelection={{
            selectedRowKeys: selectedModelIds,
            onChange: (keys) => setSelectedModelIds(keys as string[]),
          }}
        />
        {Object.keys(modelTestResults).length > 0 && (
          <div style={{ marginTop: 16, padding: 12, background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>连通性测试结果</Text>
              <Button size="small" type="text" onClick={() => setModelTestResults({})}>清空</Button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflow: "auto" }}>
              {Object.entries(modelTestResults).map(([id, result]) => {
                const model = modelsList.find((m) => m.id === id);
                if (!result) return null;
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 4, background: result.status === "ok" ? "#f6ffed" : "#fff2f0", fontSize: 12 }}>
                    {result.status === "ok"
                      ? <CheckCircleOutlined style={{ color: "#52c41a" }} />
                      : <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
                    }
                    <Text strong style={{ fontSize: 12, minWidth: 160 }}>{model?.displayName || model?.modelId || id}</Text>
                    {result.status === "ok" ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>通过 · {result.elapsed}ms</Text>
                    ) : (
                      <Text type="danger" style={{ fontSize: 12, flex: 1 }} ellipsis={{ tooltip: result.message }}>失败 · {result.message?.slice(0, 120) || "未知错误"}</Text>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>

      {/* === Add Model Modal === */}
      <Modal
        title={`添加模型 — ${modelsProvider?.displayName || modelsProvider?.name}`}
        open={addModelOpen}
        onOk={handleAddModel}
        onCancel={() => setAddModelOpen(false)}
        confirmLoading={addModelLoading}
        destroyOnHidden
        width={640}
      >
        <Form form={addModelForm} layout="vertical">
          <Form.Item name="modelId" label="模型 ID" rules={[{ required: true, message: "请输入模型 ID" }]}>
            <Input placeholder="如 gpt-4o, deepseek-v4-flash, claude-sonnet-4" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="留空则使用模型 ID" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contextLength" label="上下文长度" initialValue={128000}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxOutputTokens" label="最大输出 Tokens" initialValue={4096}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: "8px 0 16px" }}>模态支持</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="supportsText" label="文本" valuePropName="checked" initialValue><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsImage" label="图片" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsVideo" label="视频" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsAudio" label="语音" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Divider style={{ margin: "8px 0 16px" }}>能力</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="supportsFunctionCalling" label="函数调用" valuePropName="checked" initialValue><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsStreaming" label="流式输出" valuePropName="checked" initialValue><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsThinking" label="推理/思考" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsStructuredOutput" label="结构化输出" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.supportsThinking !== cur.supportsThinking}
          >
            {() => {
              const thinking = addModelForm.getFieldValue("supportsThinking");
              if (!thinking) return null;
              return (
                <div style={{ padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", marginBottom: 16 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="effortValues" label="思考强度" extra="用户可选择的推理强度级别，输入后自动转为小写">
                        <Select
                          mode="tags"
                          placeholder="输入强度级别，如 low, medium, high"
                          tokenSeparators={[","]}
                          options={[
                            { value: "minimal", label: "minimal" },
                            { value: "low", label: "low" },
                            { value: "medium", label: "medium" },
                            { value: "high", label: "high" },
                            { value: "xhigh", label: "xhigh" },
                            { value: "max", label: "max" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="budgetMin" label="Token 预算下限" extra="留空则无限制">
                        <InputNumber className="w-full" min={0} placeholder="如 1024" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="budgetMax" label="Token 预算上限" extra="留空则无限制">
                        <InputNumber className="w-full" min={0} placeholder="如 32768" />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              );
            }}
          </Form.Item>
          <Divider style={{ margin: "8px 0 16px" }}>价格 ($/M tokens)</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pricingInput" label="输入价格">
                <InputNumber className="w-full" min={0} step={0.01} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pricingOutput" label="输出价格">
                <InputNumber className="w-full" min={0} step={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Select options={[
                  { value: 1, label: "启用" },
                  { value: 0, label: "禁用" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}>
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* === Edit Model Modal === */}
      <Modal
        title={`编辑模型 — ${editModel?.displayName || editModel?.modelId}`}
        open={editModelOpen}
        onOk={handleEditModel}
        onCancel={() => setEditModelOpen(false)}
        destroyOnHidden
        width={640}
      >
        <Form form={editModelForm} layout="vertical">
          <Form.Item name="displayName" label="显示名称">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contextLength" label="上下文长度">
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxOutputTokens" label="最大输出 Tokens">
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </Col>
          </Row>
          <Divider style={{ margin: "8px 0 16px" }}>模态支持</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="supportsText" label="文本" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsImage" label="图片" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsVideo" label="视频" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsAudio" label="语音" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Divider style={{ margin: "8px 0 16px" }}>能力</Divider>
          <Row gutter={16}>
            <Col span={6}><Form.Item name="supportsFunctionCalling" label="函数调用" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsStreaming" label="流式输出" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsThinking" label="推理/思考" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={6}><Form.Item name="supportsStructuredOutput" label="结构化输出" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.supportsThinking !== cur.supportsThinking}
          >
            {() => {
              const thinking = editModelForm.getFieldValue("supportsThinking");
              if (!thinking) return null;
              const ro = editModel?.reasoningOptions;
              return (
                <div style={{ padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0", marginBottom: 16 }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="effortValues" label="思考强度" extra="用户可选择的推理强度级别，输入后自动转为小写">
                        <Select
                          mode="tags"
                          placeholder="输入强度级别，如 low, medium, high"
                          tokenSeparators={[","]}
                          options={[
                            { value: "minimal", label: "minimal" },
                            { value: "low", label: "low" },
                            { value: "medium", label: "medium" },
                            { value: "high", label: "high" },
                            { value: "xhigh", label: "xhigh" },
                            { value: "max", label: "max" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="budgetMin" label="Token 预算下限" extra="留空则无限制">
                        <InputNumber className="w-full" min={0} placeholder="如 1024" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item name="budgetMax" label="Token 预算上限" extra="留空则无限制">
                        <InputNumber className="w-full" min={0} placeholder="如 32768" />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              );
            }}
          </Form.Item>
          <Divider style={{ margin: "8px 0 16px" }}>价格 ($/M tokens)</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pricingInput" label="输入价格">
                <InputNumber className="w-full" min={0} step={0.01} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pricingOutput" label="输出价格">
                <InputNumber className="w-full" min={0} step={0.01} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={[
                  { value: 1, label: "启用" },
                  { value: 0, label: "禁用" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序">
                <InputNumber className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
