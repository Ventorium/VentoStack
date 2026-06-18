import { client } from "@/api";
import { streamChat, type ChatStreamParams } from "@/api/sse-client";
import { Card, Empty, Button, Form, Input, Modal, Space, Tag, Typography, theme, Spin, message as msg } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ChatMessage, ModelOption } from "./types";

import ThreadList from "./components/ThreadList";
import TopToolbar from "./components/TopToolbar";
import ChatArea from "./components/ChatArea";
import BottomInput from "./components/BottomInput";

const { Text } = Typography;

/** Fallback model when DB has no models configured */
const FALLBACK_MODEL: ModelOption = {
  id: "default", name: "请先在 AI 配置中添加供应商和模型", provider: "", contextWindow: 128000,
};

interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  model: string;
  systemPrompt: string;
  tools: string[];
  skills: Array<{ id: string; name: string; description: string | null }>;
  mcpServers: Array<{ id: string; name: string; description: string | null; toolCount: number }>;
  knowledgeBases: Array<{ id: string; name: string; description: string | null }>;
}

export default function AIChatPage() {
  const { token } = theme.useToken();
  const [searchParams] = useSearchParams();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<Array<{ id: string; title: string; lastMessage: string; updatedAt: string }>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<ModelOption>(FALLBACK_MODEL);
  const [dbModels, setDbModels] = useState<ModelOption[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);

  // 能力开关状态
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [enabledMcp, setEnabledMcp] = useState<string[]>([]);
  const [enabledKbs, setEnabledKbs] = useState<string[]>([]);

  // Token 用量追踪
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });

  // 工作区文件
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ path: string; size: number; modifiedAt: string }>>([]);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  // 导出 Skill Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportForm] = Form.useForm();

  // All available abilities for matching
  const [allSkills, setAllSkills] = useState<Array<{ id: string; name: string; description: string | null; enabled: boolean }>>([]);
  const [allMcpServers, setAllMcpServers] = useState<Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }>>([]);
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  // Fetch all available abilities for matching
  useEffect(() => {
    // Fetch skills
    client.get("/api/ai/skills", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null; enabled: boolean }> })?.list;
      if (list?.length) setAllSkills(list);
    }).catch(() => {});

    // Fetch MCP servers
    client.get("/api/ai/mcp-servers", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null; status: string; toolCount: number }> })?.list;
      if (list?.length) setAllMcpServers(list);
    }).catch(() => {});

    // Fetch knowledge bases
    client.get("/api/ai/knowledge-bases", { query: { pageSize: 100 } }).then(({ data }) => {
      const list = (data as { list?: Array<{ id: string; name: string; description: string | null }> })?.list;
      if (list?.length) setAllKnowledgeBases(list);
    }).catch(() => {});
  }, []);

  // Fetch agents list
  useEffect(() => {
    setLoadingAgents(true);
    client.get("/api/ai/agents", { query: { pageSize: 100, status: "active" } })
      .then(({ data }) => {
        const list = (data as { list?: Array<{ id: string; name: string; description: string | null; model: string; systemPrompt: string; tools: string[] | null; skillIds: string[] | null; mcpServerIds: string[] | null; knowledgeBaseIds: string[] | null }> })?.list;
        if (list?.length) {
          const agentInfos: AgentInfo[] = list.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            model: a.model,
            systemPrompt: a.systemPrompt,
            tools: a.tools ?? [],
            skills: [], // Will be populated after matching
            mcpServers: [], // Will be populated after matching
            knowledgeBases: [], // Will be populated after matching
          }));
          setAgents(agentInfos);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAgents(false));
  }, []);

  // Fetch models from DB
  useEffect(() => {
    client.get("/api/ai/models").then(({ data }) => {
      const models = data as Array<{ modelId: string; displayName: string | null; providerName: string; contextLength: number }> | undefined;
      if (models?.length) {
        const options: ModelOption[] = models.map((m) => ({
          id: m.modelId,
          name: m.displayName || m.modelId,
          provider: m.providerName,
          contextWindow: m.contextLength,
        }));
        setDbModels(options);
      }
    }).catch(() => {});
  }, []);

  // Select agent and fetch its full details
  const handleSelectAgent = useCallback(async (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setMessages([]);
    setThreads([]);
    setActiveThreadId(null);
    setSessionId(undefined);

    // Set default model based on agent config
    if (agent.model && dbModels.length > 0) {
      const found = dbModels.find(m => m.id === agent.model);
      if (found) setCurrentModel(found);
    }

    // Fetch full agent details
    try {
      const { data: detail } = await client.get("/api/ai/agents/:id", { params: { id: agent.id } }) as {
        data?: {
          tools: string[] | null;
          skillIds: string[] | null;
          mcpServerIds: string[] | null;
          knowledgeBaseIds: string[] | null;
        };
      };

      if (detail) {
        const toolList = detail.tools ?? [];
        const skillIds = detail.skillIds ?? [];
        const mcpIds = detail.mcpServerIds ?? [];
        const kbIds = detail.knowledgeBaseIds ?? [];

        // Match IDs with full objects
        const matchedSkills = allSkills.filter(s => skillIds.includes(s.id));
        const matchedMcp = allMcpServers.filter(m => mcpIds.includes(m.id));
        const matchedKbs = allKnowledgeBases.filter(k => kbIds.includes(k.id));

        const fullAgent: AgentInfo = {
          ...agent,
          tools: toolList,
          skills: matchedSkills.map(s => ({ id: s.id, name: s.name, description: s.description })),
          mcpServers: matchedMcp.map(m => ({ id: m.id, name: m.name, description: m.description, toolCount: m.toolCount })),
          knowledgeBases: matchedKbs.map(k => ({ id: k.id, name: k.name, description: k.description })),
        };
        setSelectedAgent(fullAgent);
        // Enable all by default
        setEnabledTools(toolList);
        setEnabledSkills(skillIds);
        setEnabledMcp(mcpIds);
        setEnabledKbs(kbIds);
      }
    } catch (e) {
      console.error("Failed to fetch agent details:", e);
    }
  }, [dbModels, allSkills, allMcpServers, allKnowledgeBases]);

  // URL 参数自动选择 agent
  useEffect(() => {
    const agentParam = searchParams.get("agent");
    if (agentParam && agents.length > 0 && !selectedAgent) {
      const matched = agents.find(a => a.name === agentParam || a.id === agentParam);
      if (matched) handleSelectAgent(matched);
    }
  }, [agents, searchParams, selectedAgent, handleSelectAgent]);

  // 获取工作区文件
  const fetchWorkspaceFiles = useCallback(async (agentId: string) => {
    try {
      const { error, data } = (await client.get(`/api/ai/agents/${agentId}/workspace/files`)) as { error?: unknown; data?: Array<{ path: string; size: number; modifiedAt: string }> };
      if (!error && data) setWorkspaceFiles(data);
    } catch { setWorkspaceFiles([]); }
  }, []);

  // 选中 agent 后获取工作区文件
  useEffect(() => {
    if (selectedAgent) {
      fetchWorkspaceFiles(selectedAgent.id);
    } else {
      setWorkspaceFiles([]);
    }
  }, [selectedAgent, fetchWorkspaceFiles]);

  // 消息完成后刷新工作区文件
  useEffect(() => {
    if (selectedAgent && !loading) {
      fetchWorkspaceFiles(selectedAgent.id);
    }
  }, [messages, loading, selectedAgent, fetchWorkspaceFiles]);

  // 预览工作区文件
  const handlePreviewFile = useCallback(async (path: string) => {
    if (!selectedAgent) return;
    setPreviewFilePath(path);
    const { error, data } = (await client.get(`/api/ai/agents/${selectedAgent.id}/workspace/file`, { query: { path } })) as { error?: unknown; data?: { content: string } };
    if (!error && data) setPreviewFileContent(data.content);
  }, [selectedAgent]);

  // 是否为 skill-creator agent
  const isSkillCreator = selectedAgent?.name === "Skill Creator";

  // 导出为 Skill
  const handleExportSkill = useCallback(async () => {
    if (!selectedAgent) return;
    // 验证 SKILL.md 存在
    if (!workspaceFiles.some(f => f.path === "SKILL.md")) {
      msg.error("工作区中缺少 SKILL.md 文件");
      return;
    }
    setExportModalOpen(true);
  }, [selectedAgent, workspaceFiles]);

  const handleExportSubmit = useCallback(async () => {
    if (!selectedAgent) return;
    try {
      const values = await exportForm.validateFields();
      // 读取所有工作区文件
      const files: Array<{ path: string; content: string }> = [];
      for (const f of workspaceFiles) {
        const { error, data } = (await client.get(`/api/ai/agents/${selectedAgent.id}/workspace/file`, { query: { path: f.path } })) as { error?: unknown; data?: { content: string } };
        if (!error && data) files.push({ path: f.path, content: data.content });
      }

      // 构建 FormData 上传
      const formData = new FormData();
      // 创建一个 zip-like 的结构，但这里直接用 upload 接口的 filesOverride 路径
      // 实际上我们需要用 installFromUpload 的 filesOverride，但前端没有这个接口
      // 所以我们用 slug + name + description + version 调用一个新接口
      // 暂时用现有的 upload 接口，但需要创建一个 ZIP
      // 简化方案：直接调用一个新接口来从工作区安装
      const { error } = (await client.post("/api/ai/skills/install-from-workspace", {
        body: {
          agentId: selectedAgent.id,
          slug: values.slug,
          name: values.name,
          description: values.description || "",
          version: values.version || "1.0.0",
          files: files,
        },
      })) as { error?: unknown };
      if (!error) {
        msg.success("Skill 导出成功");
        setExportModalOpen(false);
        exportForm.resetFields();
      }
    } catch { /* validation failed */ }
  }, [selectedAgent, workspaceFiles, exportForm]);

  // Send message
  const handleSend = useCallback(
    async (content: string) => {
      if (loading || !selectedAgent) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        isStreaming: true,
        model: currentModel.name,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setLoading(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const params: ChatStreamParams = {
        agentId: selectedAgent.id,
        message: content,
        sessionId,
        // Send enabled abilities
        tools: enabledTools,
        skillIds: enabledSkills,
        mcpServerIds: enabledMcp,
        knowledgeBaseIds: enabledKbs,
      };

      const stepTimers = new Map<string, number>();

      await streamChat(
        params,
        {
          onContent: (delta) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: msg.content + delta }
                  : msg,
              ),
            );
          },
          onToolCall: (toolCall) => {
            stepTimers.set(toolCall.id, Date.now());
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      steps: [
                        ...(msg.steps ?? []),
                        {
                          id: toolCall.id || crypto.randomUUID(),
                          type: "tool" as const,
                          name: toolCall.name,
                          description: "执行工具调用",
                          durationMs: 0,
                          status: "running" as const,
                        },
                      ],
                    }
                  : msg,
              ),
            );
          },
          onUsage: (usage) => {
            setTotalTokens(prev => ({
              input: prev.input + usage.promptTokens,
              output: prev.output + usage.completionTokens,
            }));
          },
          onError: (error) => {
            // 标记所有 running 步骤为 error
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      content: msg.content + `\n\n❌ 错误: ${error.message}`,
                      isStreaming: false,
                      steps: msg.steps?.map(s =>
                        s.status === "running" ? { ...s, status: "error" as const } : s
                      ),
                    }
                  : msg,
              ),
            );
            setLoading(false);
          },
          onDone: () => {
            const now = Date.now();
            // 标记所有 running 步骤为 completed，计算耗时
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      isStreaming: false,
                      steps: msg.steps?.map(s =>
                        s.status === "running"
                          ? { ...s, status: "completed" as const, durationMs: now - (stepTimers.get(s.id) ?? now) }
                          : s
                      ),
                    }
                  : msg,
              ),
            );
            setLoading(false);
          },
        },
        controller.signal,
      );
    },
    [loading, selectedAgent, currentModel, sessionId, enabledTools, enabledSkills, enabledMcp, enabledKbs],
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setLoading(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg)),
    );
  }, []);

  // New chat
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setTotalTokens({ input: 0, output: 0 });
  }, []);

  // Regenerate last assistant message
  const handleRegenerate = useCallback((messageId: string) => {
    // 找到该 assistant 消息之前的最后一条 user 消息
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex < 0) return;
    // 移除该 assistant 消息
    const newMessages = messages.slice(0, msgIndex);
    const lastUserMsg = [...newMessages].reverse().find(m => m.role === "user");
    if (!lastUserMsg) return;
    setMessages(newMessages);
    // 重新发送
    handleSend(lastUserMsg.content);
  }, [messages, handleSend]);

  // Context usage
  const contextUsage = {
    used: totalTokens.input + totalTokens.output || messages.reduce(
      (sum, m) => sum + (m.tokensUsed?.input ?? 0) + (m.tokensUsed?.output ?? 0),
      0,
    ),
    total: currentModel.contextWindow,
  };

  // Agent selection screen
  if (!selectedAgent) {
    return (
      <Card
        title="选择智能体"
        styles={{ body: { padding: 24, minHeight: 400 } }}
      >
        {loadingAgents ? (
          <div className="text-center p-10"><Spin size="large" /></div>
        ) : agents.length === 0 ? (
          <Empty description="暂无可用的智能体，请先在 Agent 管理中创建">
            <Button type="primary" href="/app/ai/agents">前往创建</Button>
          </Empty>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {agents.map(agent => (
              <Card
                key={agent.id}
                hoverable
                onClick={() => handleSelectAgent(agent)}
                style={{ borderColor: token.colorBorderSecondary }}
              >
                <Space direction="vertical" className="w-full">
                  <Space>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: token.colorPrimaryBg }}
                    >
                      <RobotOutlined className="text-xl" style={{ color: token.colorPrimary }} />
                    </div>
                    <div>
                      <Text strong>{agent.name}</Text>
                      <div>
                        <Text type="secondary" className="text-xs">{agent.model}</Text>
                      </div>
                    </div>
                  </Space>
                  {agent.description && (
                    <Text type="secondary" className="text-xs" ellipsis={{ rows: 2 }}>
                      {agent.description}
                    </Text>
                  )}
                  <Space size={4} wrap>
                    {agent.tools.length > 0 && <Tag>{agent.tools.length} 工具</Tag>}
                  </Space>
                </Space>
              </Card>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      styles={{
        body: {
          padding: 0,
          height: "calc(100vh - 180px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      {/* Top Toolbar */}
      <TopToolbar
        agentName={selectedAgent.name}
        agent={selectedAgent}
        enabledTools={enabledTools}
        enabledSkills={enabledSkills}
        enabledMcp={enabledMcp}
        enabledKbs={enabledKbs}
        onToggleTool={(tool, enabled) => {
          setEnabledTools(prev => enabled ? [...prev, tool] : prev.filter(t => t !== tool));
        }}
        onToggleSkill={(id, enabled) => {
          setEnabledSkills(prev => enabled ? [...prev, id] : prev.filter(s => s !== id));
        }}
        onToggleMcp={(id, enabled) => {
          setEnabledMcp(prev => enabled ? [...prev, id] : prev.filter(m => m !== id));
        }}
        onToggleKb={(id, enabled) => {
          setEnabledKbs(prev => enabled ? [...prev, id] : prev.filter(k => k !== id));
        }}
        onBack={() => {
          setSelectedAgent(null);
          setMessages([]);
          setThreads([]);
        }}
      />

      {/* Main Body: Thread List + Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <ThreadList
          threads={threads}
          activeId={activeThreadId ?? undefined}
          onSelect={setActiveThreadId}
          onNew={handleNewChat}
        />

        {/* Chat Column */}
        <div
          className="flex-1 flex flex-col min-w-0"
        >
          {/* Chat Area */}
          <ChatArea messages={messages} agentName={selectedAgent.name} onRegenerate={handleRegenerate} />

          {/* Bottom Input */}
          <BottomInput
            onSend={handleSend}
            onStop={handleStop}
            loading={loading}
            currentModel={currentModel}
            models={dbModels.length > 0 ? dbModels : [FALLBACK_MODEL]}
            onModelChange={setCurrentModel}
            contextUsage={contextUsage}
            workspaceFiles={workspaceFiles}
            isSkillCreator={isSkillCreator}
            onExportSkill={handleExportSkill}
            onPreviewFile={handlePreviewFile}
          />
        </div>
      </div>

      {/* 文件预览 Modal */}
      <Modal
        title={previewFilePath ?? "文件预览"}
        open={!!previewFilePath}
        onCancel={() => { setPreviewFilePath(null); setPreviewFileContent(null); }}
        footer={null}
        width={640}
      >
        <pre className="text-xs leading-1.6 whitespace-pre-wrap break-words max-h-[400px] overflow-auto p-3" style={{ background: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}>
          {previewFileContent ?? "加载中..."}
        </pre>
      </Modal>

      {/* 导出 Skill Modal */}
      <Modal
        title="导出为 Skill"
        open={exportModalOpen}
        onCancel={() => { setExportModalOpen(false); exportForm.resetFields(); }}
        onOk={handleExportSubmit}
        okText="导出安装"
        cancelText="取消"
        width={480}
      >
        <Form form={exportForm} layout="vertical">
          <Form.Item name="slug" label="Slug" rules={[{ required: true, message: "请输入 slug" }]}>
            <Input placeholder="如 my-custom-skill" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="技能显示名称" />
          </Form.Item>
          <Form.Item name="version" label="版本号" initialValue="1.0.0">
            <Input placeholder="如 1.0.0" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="技能描述" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
