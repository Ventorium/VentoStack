import { client } from '@/api';
import { type ChatStreamParams, streamChat } from '@/api/sse-client';
import { Button, Card, Empty, Form, Input, Modal, Spin, message as msg, theme } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChatMessage, ModelOption } from '../types';

import BottomInput from '../components/BottomInput';
import ChatArea from '../components/ChatArea';
import KnowledgePanel from '../components/KnowledgePanel';
import MemoryPanel from '../components/MemoryPanel';
import ThreadList from '../components/ThreadList';
import TopToolbar from '../components/TopToolbar';

/** Fallback model when DB has no models configured */
const FALLBACK_MODEL: ModelOption = {
  id: 'default',
  name: '请先在 AI 配置中添加供应商和模型',
  provider: '',
  contextWindow: 128000,
  supportsImage: false,
};

interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  welcomeMessage: string | null;
  requiresVirtualEnvironment: boolean;
  /** 可用模型 ID 白名单（第一项为默认模型） */
  models: string[];
  systemPrompt: string;
  tools: string[];
  skills: Array<{ id: string; name: string; description: string | null }>;
  mcpServers: Array<{ id: string; name: string; description: string | null; toolCount: number }>;
  knowledgeBases: Array<{ id: string; name: string; description: string | null }>;
}

export default function AgentChatPage(): React.ReactElement {
  const { agentId } = useParams<{ agentId: string }>();
  return <AgentConversation key={agentId} />;
}

function AgentConversation(): React.ReactElement {
  const { token } = theme.useToken();
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<
    Array<{ id: string; title: string; lastMessage: string; updatedAt: string }>
  >([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [currentModel, setCurrentModel] = useState<ModelOption>(FALLBACK_MODEL);
  const [dbModels, setDbModels] = useState<ModelOption[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [thinkingLevel, setThinkingLevel] = useState<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>('off');
  const [attachments, setAttachments] = useState<Array<{ path: string; name: string }>>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  // 能力开关状态
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [enabledMcp, setEnabledMcp] = useState<string[]>([]);
  const [enabledKbs, setEnabledKbs] = useState<string[]>([]);
  const [boundKbIds, setBoundKbIds] = useState<string[]>([]);

  // Token 用量追踪
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });

  // 工作区文件
  const [workspaceFiles, setWorkspaceFiles] = useState<
    Array<{ path: string; size: number; modifiedAt: string }>
  >([]);
  const [previewFileContent, setPreviewFileContent] = useState<string | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  // 导出 Skill Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportForm] = Form.useForm();

  // All available abilities for matching
  const [allSkills, setAllSkills] = useState<
    Array<{ id: string; name: string; description: string | null; enabled: boolean }>
  >([]);
  const [allMcpServers, setAllMcpServers] = useState<
    Array<{
      id: string;
      name: string;
      description: string | null;
      status: string;
      toolCount: number;
    }>
  >([]);
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<
    Array<{ id: string; name: string; description: string | null }>
  >([]);
  const [toolDescriptions, setToolDescriptions] = useState<Record<string, string>>({});

  // Fetch all available abilities for matching
  useEffect(() => {
    // Fetch tool registry (name → description)
    client
      .get('/api/ai/tools')
      .then(({ data }) => {
        const list = data as Array<{ name: string; description: string | null }> | undefined;
        if (list?.length) {
          const map: Record<string, string> = {};
          for (const t of list) {
            if (t.description) map[t.name] = t.description;
          }
          setToolDescriptions(map);
        }
      })
      .catch(() => {});

    // Fetch skills
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
        if (list?.length) setAllSkills(list);
      })
      .catch(() => {});

    // Fetch MCP servers
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
        if (list?.length) setAllMcpServers(list);
      })
      .catch(() => {});

    // Fetch knowledge bases
    client
      .get('/api/ai/knowledge-bases', { query: { pageSize: 100 } })
      .then(({ data }) => {
        const list = (
          data as { list?: Array<{ id: string; name: string; description: string | null }> }
        )?.list;
        if (list?.length) setAllKnowledgeBases(list);
      })
      .catch(() => {});
  }, []);

  // Fetch agents list
  useEffect(() => {
    setLoadingAgents(true);
    client
      .get('/api/ai/agents', { query: { pageSize: 100, status: 'active' } })
      .then(({ data }) => {
        const list = (
          data as {
            list?: Array<{
              id: string;
              name: string;
              description: string | null;
              welcomeMessage: string | null;
              model: string[];
              systemPrompt: string;
              tools: string[] | null;
              skillIds: string[] | null;
              mcpServerIds: string[] | null;
              knowledgeBaseIds: string[] | null;
              requiresVirtualEnvironment: boolean;
            }>;
          }
        )?.list;
        if (list?.length) {
          const agentInfos: AgentInfo[] = list.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            welcomeMessage: a.welcomeMessage,
            models: a.model ?? [],
            systemPrompt: a.systemPrompt,
            requiresVirtualEnvironment: a.requiresVirtualEnvironment,
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
    client
      .get('/api/ai/models')
      .then(({ data }) => {
        const models = data as
          | Array<{
              modelId: string;
              displayName: string | null;
              providerName: string;
              contextLength: number;
              supportsImage: boolean;
              supportsThinking: boolean;
              reasoningOptions: ModelOption['reasoningOptions'];
            }>
          | undefined;
        if (models?.length) {
          const options: ModelOption[] = models.map((m) => ({
            id: m.modelId,
            name: m.displayName || m.modelId,
            provider: m.providerName,
            contextWindow: m.contextLength,
            supportsImage: m.supportsImage,
            supportsThinking: m.supportsThinking === true,
            reasoningOptions: m.reasoningOptions ?? null,
          }));
          setDbModels(options);
        }
      })
      .catch(() => {});
  }, []);

  // 模型白名单同步：当前模型不在所选 Agent 白名单内时，回退到白名单内第一个模型
  useEffect(() => {
    if (!selectedAgent || selectedAgent.models.length === 0 || dbModels.length === 0) return;
    if (!selectedAgent.models.includes(currentModel.id)) {
      const found = dbModels.find((m) => selectedAgent.models.includes(m.id));
      if (found) setCurrentModel(found);
    }
  }, [selectedAgent, dbModels, currentModel.id]);

  // 当前 Agent 可切换的模型（白名单内；白名单为空则不限制）
  const availableModels = useMemo(() => {
    if (!selectedAgent || selectedAgent.models.length === 0) return dbModels;
    return dbModels.filter((m) => selectedAgent.models.includes(m.id));
  }, [selectedAgent, dbModels]);

  // 切换模型；新模型不支持思考时重置思考强度
  const handleModelChange = useCallback((model: ModelOption) => {
    setCurrentModel(model);
    if (!model.supportsThinking) setThinkingLevel('off');
  }, []);

  // Select agent and fetch its full details
  const handleSelectAgent = useCallback(
    async (agent: AgentInfo) => {
      setSelectedAgent(agent);
      setMessages([]);
      setThreads([]);
      setActiveThreadId(null);
      setSessionId(undefined);
      setAttachments([]);
      setBoundKbIds([]);
      // 同步到路径参数，刷新后可恢复
      navigate(`/app/ai/chat/${agent.id}`, { replace: true });

      // Set default model based on agent config
      if (agent.models.length > 0 && dbModels.length > 0) {
        const found = dbModels.find((m) => agent.models.includes(m.id));
        if (found) setCurrentModel(found);
      }

      // Fetch full agent details
      try {
        const { data: detail } = (await client.get('/api/ai/agents/:id', {
          params: { id: agent.id },
        })) as {
          data?: {
            tools: string[] | null;
            skillIds: string[] | null;
            mcpServerIds: string[] | null;
            knowledgeBaseIds: string[] | null;
            requiresVirtualEnvironment: boolean;
          };
        };

        if (detail) {
          const toolList = detail.tools ?? [];
          const skillIds = detail.skillIds ?? [];
          const mcpIds = detail.mcpServerIds ?? [];
          const kbIds = detail.knowledgeBaseIds ?? [];

          // Match IDs with full objects
          const matchedSkills = allSkills.filter((s) => skillIds.includes(s.id));
          const matchedMcp = allMcpServers.filter((m) => mcpIds.includes(m.id));
          const matchedKbs = allKnowledgeBases.filter((k) => kbIds.includes(k.id));

          const fullAgent: AgentInfo = {
            ...agent,
            requiresVirtualEnvironment: detail.requiresVirtualEnvironment,
            tools: toolList,
            skills: matchedSkills.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
            })),
            mcpServers: matchedMcp.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description,
              toolCount: m.toolCount,
            })),
            knowledgeBases: matchedKbs.map((k) => ({
              id: k.id,
              name: k.name,
              description: k.description,
            })),
          };
          setSelectedAgent(fullAgent);
          // Enable all by default
          setEnabledTools(toolList);
          setEnabledSkills(skillIds);
          setEnabledMcp(mcpIds);
          setEnabledKbs(kbIds);
          setBoundKbIds(kbIds);
        }
      } catch (e) {
        console.error('Failed to fetch agent details:', e);
      }
    },
    [dbModels, allSkills, allMcpServers, allKnowledgeBases],
  );

  // Agent 详情和知识库列表并行加载；列表后返回时重新完成 ID 到详情的匹配。
  useEffect(() => {
    if (allKnowledgeBases.length === 0) return;
    const matchedKbs = allKnowledgeBases.filter((kb) => boundKbIds.includes(kb.id));
    setSelectedAgent((current) => {
      if (!current) return current;
      const currentIds = current.knowledgeBases.map((kb) => kb.id);
      const matchedIds = matchedKbs.map((kb) => kb.id);
      if (currentIds.length === matchedIds.length && currentIds.every((id, index) => id === matchedIds[index])) {
        return current;
      }
      return {
        ...current,
        knowledgeBases: matchedKbs.map((kb) => ({
          id: kb.id,
          name: kb.name,
          description: kb.description,
        })),
      };
    });
  }, [allKnowledgeBases, boundKbIds]);

  // 路径参数自动选择 agent
  useEffect(() => {
    if (agentId && agents.length > 0 && !selectedAgent) {
      const matched = agents.find((a) => a.name === agentId || a.id === agentId);
      if (matched) handleSelectAgent(matched);
    }
  }, [agents, agentId, selectedAgent, handleSelectAgent]);

  // 获取当前会话产物文件
  const fetchWorkspaceFiles = useCallback(async (conversationId?: string) => {
    if (!conversationId) {
      setWorkspaceFiles([]);
      return;
    }
    try {
      const { error, data } = (await client.get('/api/ai/conversations/:id/artifacts', {
        params: { id: conversationId },
      })) as { error?: unknown; data?: Array<{ path: string; size: number; modifiedAt: string }> };
      if (!error && data) setWorkspaceFiles(data);
    } catch {
      setWorkspaceFiles([]);
    }
  }, []);

  // 切换会话后加载对应产物
  useEffect(() => {
    fetchWorkspaceFiles(sessionId);
  }, [sessionId, fetchWorkspaceFiles]);

  // 加载会话列表（选中 agent 后，用户级会话隔离；游标分页支持滚动加载更多）
  const THREAD_PAGE_SIZE = 20;
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);

  const fetchThreads = useCallback(
    async (before?: string) => {
      if (!selectedAgent) return;
      try {
        const { data } = (await client.get('/api/ai/conversations', {
          query: {
            agentId: selectedAgent.id,
            limit: THREAD_PAGE_SIZE,
            ...(before ? { before } : {}),
          },
        })) as { data?: Array<{ id: string; title: string | null; updatedAt: string }> };
        const items = (data ?? []).map((c) => ({
          id: c.id,
          title: c.title ?? '新对话',
          lastMessage: '',
          updatedAt: c.updatedAt,
        }));
        setThreads((prev) => (before ? [...prev, ...items] : items));
        setHasMoreThreads(items.length === THREAD_PAGE_SIZE);
      } catch {
        if (!before) setThreads([]);
      }
    },
    [selectedAgent],
  );

  useEffect(() => {
    if (!selectedAgent) {
      setThreads([]);
      setHasMoreThreads(false);
      return;
    }
    fetchThreads();
  }, [selectedAgent, fetchThreads]);

  const handleLoadMoreThreads = useCallback(() => {
    if (loadingMoreThreads || !hasMoreThreads || threads.length === 0) return;
    setLoadingMoreThreads(true);
    fetchThreads(threads[threads.length - 1]!.updatedAt).finally(() =>
      setLoadingMoreThreads(false),
    );
  }, [loadingMoreThreads, hasMoreThreads, threads, fetchThreads]);

  // 切换会话：绑定 sessionId 并回显历史消息
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setActiveThreadId(threadId);
      setSessionId(threadId);
      setMessages([]);
      setAttachments([]);
      setTotalTokens({ input: 0, output: 0 });
      // 重置能力开关为 agent 默认配置，避免上一个会话的开关状态残留
      if (selectedAgent) {
        setEnabledTools(selectedAgent.tools ?? []);
        setEnabledSkills(selectedAgent.skills.map((s) => s.id));
        setEnabledMcp(selectedAgent.mcpServers.map((m) => m.id));
        setEnabledKbs(selectedAgent.knowledgeBases.map((k) => k.id));
      }
      try {
        const { data } = (await client.get('/api/ai/conversations/:id/messages', {
          params: { id: threadId },
        })) as { data?: Array<{ role: string; content: string }> };
        const history = (data ?? [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: crypto.randomUUID(),
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.content,
            timestamp: '',
          }));
        setMessages(history);
      } catch {
        /* 历史加载失败保持空 */
      }
    },
    [selectedAgent],
  );

  // 消息完成后刷新工作区文件
  useEffect(() => {
    if (sessionId && !loading) fetchWorkspaceFiles(sessionId);
  }, [messages, loading, sessionId, fetchWorkspaceFiles]);

  // 预览工作区文件
  const handlePreviewFile = useCallback(
    async (path: string) => {
      if (!sessionId) return;
      setPreviewFilePath(path);
      const { error, data } = (await client.get('/api/ai/conversations/:id/artifact', {
        params: { id: sessionId },
        query: { path },
      })) as { error?: unknown; data?: { content: string } };
      if (!error && data) setPreviewFileContent(data.content);
    },
    [sessionId],
  );

  // 是否为 skill-creator agent
  const handleExportSubmit = useCallback(async () => {
    if (!selectedAgent) return;
    try {
      const values = await exportForm.validateFields();
      // 后端从工作区磁盘读取文件，前端只需传元数据
      const { error } = (await client.post('/api/ai/skills/install-from-workspace', {
        body: {
          agentId: selectedAgent.id,
          slug: values.slug,
          name: values.name,
          description: values.description || '',
          version: values.version || '1.0.0',
        },
      })) as { error?: unknown };
      if (!error) {
        msg.success('Skill 导出成功');
        setExportModalOpen(false);
        exportForm.resetFields();
      }
    } catch {
      /* validation failed */
    }
  }, [selectedAgent, exportForm]);

  // Send message
  const handleSend = useCallback(
    async (content: string) => {
      if (loading || !selectedAgent) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
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
        thinkingLevel,
        attachmentPaths: attachments.map((file) => file.path),
      };
      // 用户选择的模型：仅在真实模型且落在 Agent 白名单内时下发，否则由后端取默认模型
      const isRealModel = dbModels.some((m) => m.id === currentModel.id);
      const modelAllowed =
        selectedAgent.models.length === 0 || selectedAgent.models.includes(currentModel.id);
      if (isRealModel && modelAllowed) params.model = currentModel.id;

      const stepTimers = new Map<string, number>();

      await streamChat(
        params,
        {
          onContent: (delta) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, content: msg.content + delta } : msg,
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
                          type: 'tool' as const,
                          name: toolCall.name,
                          ...(toolCall.name === 'read_document' ? { name: '读取文档' } : {}),
                          description: '执行工具调用',
                          durationMs: 0,
                          status: 'running' as const,
                        },
                      ],
                    }
                  : msg,
              ),
            );
          },
          onStage: (stage) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      researchStages: [...(msg.researchStages ?? []), stage],
                    }
                  : msg,
              ),
            );
          },
          onSources: (sources) => {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === assistantMessage.id ? { ...msg, sources } : msg)),
            );
          },
          onUsage: (usage) => {
            setTotalTokens((prev) => ({
              input: prev.input + usage.promptTokens,
              output: prev.output + usage.completionTokens,
            }));
          },
          onSession: (sid) => {
            // 新建会话时后端下发 sessionId，绑定以便后续消息延续同一会话
            setSessionId(sid);
            setActiveThreadId(sid);
          },
          onApprovalRequired: (approval) => {
            // 高风险工具审批：在当前消息上挂审批卡片，等待用户在聊天内确认
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, approval: { ...approval, status: 'pending' as const } }
                  : msg,
              ),
            );
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
                      steps: msg.steps?.map((s) =>
                        s.status === 'running' ? { ...s, status: 'error' as const } : s,
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
                      steps: msg.steps?.map((s) =>
                        s.status === 'running'
                          ? {
                              ...s,
                              status: 'completed' as const,
                              durationMs: now - (stepTimers.get(s.id) ?? now),
                            }
                          : s,
                      ),
                    }
                  : msg,
              ),
            );
            setLoading(false);
            void fetchThreads();
            setAttachments([]);
          },
        },
        controller.signal,
      );
    },
    [
      loading,
      selectedAgent,
      currentModel,
      sessionId,
      enabledTools,
      enabledSkills,
      enabledMcp,
      enabledKbs,
      thinkingLevel,
      attachments,
      fetchThreads,
    ],
  );

  const handleAttach = useCallback(async (files: File[]): Promise<void> => {
    if (!selectedAgent || files.length === 0) return;
    if (attachments.length + files.length > 10) {
      msg.error('每次最多添加 10 个附件');
      return;
    }
    setUploadingAttachment(true);
    try {
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        const { data, error } = (await client.post('/api/ai/conversations', {
          body: { agentId: selectedAgent.id },
        })) as { data?: { id: string }; error?: unknown };
        if (error || !data?.id) throw new Error('创建会话失败');
        targetSessionId = data.id;
        setSessionId(targetSessionId);
        setActiveThreadId(targetSessionId);
      }
      const uploaded: Array<{ path: string; name: string }> = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const { data, error } = (await client.post('/api/ai/conversations/:id/attachments', {
          params: { id: targetSessionId },
          body: form,
        })) as { data?: { path: string; name: string }; error?: unknown };
        if (error || !data) throw new Error(`${file.name} 上传失败`);
        uploaded.push(data);
      }
      setAttachments((current) => [...current, ...uploaded]);
      await fetchWorkspaceFiles(targetSessionId);
    } catch (error) {
      msg.error(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setUploadingAttachment(false);
    }
  }, [selectedAgent, attachments.length, sessionId, fetchWorkspaceFiles]);

  // 聊天内嵌审批：用户对高风险工具调用做出决定，成功后本地更新卡片状态，后端唤醒流继续执行
  const handleApprovalDecision = useCallback(
    async (approvalId: string, decision: 'approved' | 'rejected') => {
      const { error } = await client.post('/api/ai/chat/approvals/:id/confirm', {
        params: { id: approvalId },
        body: { decision },
      });
      if (error) {
        msg.error('操作失败，请重试');
        return false;
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg.approval?.id === approvalId
            ? { ...msg, approval: { ...msg.approval, status: decision } }
            : msg,
        ),
      );
      return true;
    },
    [],
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.isStreaming
          ? { ...msg, isStreaming: false, content: msg.content || '（已停止）' }
          : msg,
      ),
    );
  }, []);

  // New chat
  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setActiveThreadId(null);
    setAttachments([]);
    setTotalTokens({ input: 0, output: 0 });
    // 重置能力开关为 agent 默认配置
    if (selectedAgent) {
      setEnabledTools(selectedAgent.tools ?? []);
      setEnabledSkills(selectedAgent.skills.map((s) => s.id));
      setEnabledMcp(selectedAgent.mcpServers.map((m) => m.id));
      setEnabledKbs(selectedAgent.knowledgeBases.map((k) => k.id));
    }
  }, [selectedAgent]);

  // Regenerate last assistant message
  const handleRegenerate = useCallback(
    (messageId: string) => {
      // 找到该 assistant 消息之前的最后一条 user 消息
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;
      // 移除该 assistant 消息
      const newMessages = messages.slice(0, msgIndex);
      const lastUserMsg = [...newMessages].reverse().find((m) => m.role === 'user');
      if (!lastUserMsg) return;
      setMessages(newMessages);
      // 重新发送
      handleSend(lastUserMsg.content);
    },
    [messages, handleSend],
  );

  // Context usage
  const contextUsage = {
    used:
      totalTokens.input + totalTokens.output ||
      messages.reduce(
        (sum, m) => sum + (m.tokensUsed?.input ?? 0) + (m.tokensUsed?.output ?? 0),
        0,
      ),
    total: currentModel.contextWindow,
  };

  if (!selectedAgent) {
    return loadingAgents ? (
      <div className="p-10 text-center">
        <Spin size="large" />
      </div>
    ) : (
      <Empty description="智能体不存在或不可用">
        <Button onClick={() => navigate('/app/ai/chat')}>返回智能体列表</Button>
      </Empty>
    );
  }

  return (
    <Card
      className="h-full [&_.ant-card-body]:h-full"
      styles={{
        body: {
          padding: 0,
          // height: "calc(100vh - 180px)",
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* Top Toolbar */}
      <TopToolbar
        agentName={selectedAgent.name}
        agent={selectedAgent}
        toolDescriptions={toolDescriptions}
        enabledTools={enabledTools}
        enabledSkills={enabledSkills}
        enabledMcp={enabledMcp}
        enabledKbs={enabledKbs}
        onToggleTool={(tool, enabled) => {
          setEnabledTools((prev) => (enabled ? [...prev, tool] : prev.filter((t) => t !== tool)));
        }}
        onToggleSkill={(id, enabled) => {
          setEnabledSkills((prev) => (enabled ? [...prev, id] : prev.filter((s) => s !== id)));
        }}
        onToggleMcp={(id, enabled) => {
          setEnabledMcp((prev) => (enabled ? [...prev, id] : prev.filter((m) => m !== id)));
        }}
        onToggleKb={(id, enabled) => {
          setEnabledKbs((prev) => (enabled ? [...prev, id] : prev.filter((k) => k !== id)));
        }}
        onBack={() => {
          setSelectedAgent(null);
          setMessages([]);
          setThreads([]);
          navigate('/app/ai/chat', { replace: true });
        }}
      />

      {/* Main Body: Thread List + Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <ThreadList
          threads={threads}
          activeId={activeThreadId ?? undefined}
          onSelect={handleSelectThread}
          onNew={handleNewChat}
          onLoadMore={handleLoadMoreThreads}
          hasMore={hasMoreThreads}
          loadingMore={loadingMoreThreads}
        />

        {/* Chat Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 overflow-hidden flex">
            {activeTab === 'chat' && (
              <ChatArea
                messages={messages}
                agentName={selectedAgent.name}
                welcomeMessage={selectedAgent.welcomeMessage}
                onRegenerate={handleRegenerate}
                onApprovalDecision={handleApprovalDecision}
              />
            )}
            {activeTab === 'files' && (
              <div className={`h-full overflow-auto p-5 ${workspaceFiles.length === 0 ? 'flex items-center justify-center' : ''}`}>
                {selectedAgent.name === 'Skill Creator' && workspaceFiles.some((file) => file.path === 'SKILL.md') && (
                  <Button type="primary" className="mb-3" onClick={() => setExportModalOpen(true)}>导出为 Skill</Button>
                )}
                {workspaceFiles.length === 0 ? (
                  <Empty description="当前会话暂无生成文件" />
                ) : (
                  workspaceFiles.map((file) => (
                    <Button
                      key={file.path}
                      type="text"
                      block
                      className="mb-1 text-left"
                      onClick={() => handlePreviewFile(file.path)}
                    >
                      {file.path}
                    </Button>
                  ))
                )}
              </div>
            )}
            {activeTab === 'memory' && (
              <MemoryPanel sessionId={sessionId} />
            )}
            {activeTab === 'knowledge' && (
              <KnowledgePanel knowledgeBases={selectedAgent.knowledgeBases} />
            )}
          </div>

          {/* Bottom Input */}
          <BottomInput
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onSend={handleSend}
            onStop={handleStop}
            loading={loading}
            currentModel={currentModel}
            models={availableModels}
            onModelChange={handleModelChange}
            attachments={attachments}
            uploadingAttachment={uploadingAttachment}
            thinkingLevel={thinkingLevel}
            onAttach={(files) => void handleAttach(files)}
            onAttachWorkspaceFile={(file) => {
              setAttachments((current) => current.some((item) => item.path === file.path)
                ? current
                : [...current, { path: file.path, name: file.path.split('/').pop() ?? file.path }]);
            }}
            onRemoveAttachment={(path) => setAttachments((current) => current.filter((file) => file.path !== path))}
            onThinkingLevelChange={setThinkingLevel}
            skills={selectedAgent?.skills ?? []}
            onSelectSkill={(id) => setEnabledSkills((current) => current.includes(id) ? current : [...current, id])}
            contextUsage={contextUsage}
            workspaceFiles={workspaceFiles}
          />
        </div>
      </div>

      {/* 文件预览 Modal */}
      <Modal
        title={previewFilePath ?? '文件预览'}
        open={!!previewFilePath}
        onCancel={() => {
          setPreviewFilePath(null);
          setPreviewFileContent(null);
        }}
        footer={null}
        width={640}
      >
        <pre
          className="text-xs leading-1.6 whitespace-pre-wrap break-words max-h-[400px] overflow-auto p-3"
          style={{ background: token.colorFillQuaternary, borderRadius: token.borderRadiusLG }}
        >
          {previewFileContent ?? '加载中...'}
        </pre>
      </Modal>

      {/* 导出 Skill Modal */}
      <Modal
        title="导出为 Skill"
        open={exportModalOpen}
        onCancel={() => {
          setExportModalOpen(false);
          exportForm.resetFields();
        }}
        onOk={handleExportSubmit}
        okText="导出安装"
        cancelText="取消"
        width={480}
      >
        <Form form={exportForm} layout="vertical">
          <Form.Item name="slug" label="Slug" rules={[{ required: true, message: '请输入 slug' }]}>
            <Input placeholder="如 my-custom-skill" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
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
