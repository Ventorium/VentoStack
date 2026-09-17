import { client } from '@/api';
import { type ChatStreamParams, streamChat } from '@/api/sse-client';
import type { FileEntry } from '@/api/types';
import { MenuUnfoldOutlined, RestOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Form, Input, Modal, Spin, message as msg, theme } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChatApproval, ChatMessage, ModelOption, ToolBlock } from '../types';

import BottomInput, { allowedThinkingLevels } from '../components/BottomInput';
import ChatArea from '../components/ChatArea';
import FilesPanel from '../components/FilesPanel';
import KnowledgePanel from '../components/KnowledgePanel';
import MemoryPanel from '../components/MemoryPanel';
import type { RunMode } from '../components/RunModeSelect';
import ThreadList from '../components/ThreadList';
import TopToolbar from '../components/TopToolbar';
import TrashDialog from '../components/TrashDialog';

/** Fallback model when DB has no models configured */
const FALLBACK_MODEL: ModelOption = {
  id: 'default',
  name: '请先在 AI 配置中添加供应商和模型',
  provider: '',
  contextWindow: 128000,
  supportsImage: false,
};

/** 工具名到中文展示名的映射（与流式渲染保持一致） */
const TOOL_NAME_MAP: Record<string, string> = {
  'kb-browse': '浏览知识库',
  'kb-search': '检索知识库',
  'kb-read': '阅读文档',
  'kb-outline': '文档大纲',
  'kb-follow-link': '打开文档链接',
  read_document: '读取文档',
  web_search: '网页搜索',
  calculator: '计算器',
};

function toolDisplayName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;
}

/**
 * 解析持久化的 assistant 消息：去掉末尾 `[工具调用: a, b]` 摘要行，返回正文。
 * 工具块本身由紧随其后的 role:'tool' 消息（parsePersistedTool）重建。
 */
function parsePersistedAssistant(content: string): string {
  const match = content.match(/\n?\[工具调用: ([^\]]*)\]\s*$/);
  // match.index 为 0（空正文只有摘要行）时也要剥离，避免残留孤儿摘要文本
  if (!match || match.index === undefined) return content;
  return content.slice(0, match.index).trimEnd();
}

interface PersistedToolEnvelope {
  toolCallId?: string;
  name: string;
  arguments?: Record<string, unknown>;
  output?: string;
  durationMs?: number;
  isError?: boolean;
}

/**
 * 解析持久化的 role:'tool' 消息：新格式为 JSON 信封（含参数/输出/耗时），
 * 旧格式为 `[工具名] 输出`（仅含输出）。还原为可展开查看的工具块。
 */
function parsePersistedTool(content: string): ToolBlock | null {
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content) as PersistedToolEnvelope;
      if (typeof parsed.name === 'string' && parsed.name) {
        return {
          type: 'tool',
          id: parsed.toolCallId || crypto.randomUUID(),
          name: toolDisplayName(parsed.name),
          status: parsed.isError ? 'error' : 'completed',
          ...(parsed.durationMs === undefined ? {} : { durationMs: parsed.durationMs }),
          ...(parsed.arguments === undefined
            ? {}
            : { arguments: JSON.stringify(parsed.arguments, null, 2) }),
          ...(parsed.output === undefined ? {} : { output: parsed.output }),
        };
      }
    } catch {
      /* 非信封格式，回退旧格式解析 */
    }
  }
  const legacy = content.match(/^\[([^\]]+)\]\s?([\s\S]*)$/);
  if (legacy) {
    return {
      type: 'tool',
      id: crypto.randomUUID(),
      name: toolDisplayName(legacy[1]!),
      status: 'completed',
      ...(legacy[2] ? { output: legacy[2] } : {}),
    };
  }
  return null;
}

/** 审批台账信封：后端把审批生命周期合成 role:'approval' 行下发（待审批与已决议同一形状） */
interface PersistedApprovalEnvelope {
  id: string;
  toolName: string;
  input?: Record<string, unknown>;
  expiresAt?: string;
  riskLevel?: ChatApproval['riskLevel'];
  status?: ChatApproval['status'];
  toolCallId?: string;
  reason?: string;
}

/** 解析持久化的 role:'approval' 行 → 审批状态卡片数据；格式非法返回 null */
function parsePersistedApproval(content: string): ChatApproval | null {
  if (!content.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content) as PersistedApprovalEnvelope;
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    return {
      id: parsed.id,
      toolName: parsed.toolName,
      input: parsed.input ?? {},
      expiresAt: parsed.expiresAt ?? '',
      status: parsed.status ?? 'pending',
      ...(parsed.riskLevel ? { riskLevel: parsed.riskLevel } : {}),
      ...(parsed.toolCallId ? { toolCallId: parsed.toolCallId } : {}),
      ...(parsed.reason ? { reason: parsed.reason } : {}),
    };
  } catch {
    return null;
  }
}

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
  const sessionIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  // 链接上的 ?s=xxx 会话 ID：首次渲染即捕获（Agent 就绪后恢复），消费后置空
  const pendingUrlSessionRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('s'),
  );
  // 会话列表收起/展开 + 回收站
  const [threadListCollapsed, setThreadListCollapsed] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<
    'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  >('off');
  // 审批策略：默认需人工审批；只对「本次发送」生效，发送后回到默认，不静默延续
  const [runMode, setRunMode] = useState<RunMode>('ask');
  // Agent 配置的默认思考强度：等模型列表就绪后由白名单同步 effect 应用（null 表示未暂存）
  const pendingThinkingRef = useRef<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null>(
    null,
  );
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

  // 引用来源点击跳转文件预览
  const [openFileTarget, setOpenFileTarget] = useState<{ path: string; nonce: number } | null>(
    null,
  );
  // 知识库引用定位：点击引用时切到知识库页签并选中对应文件
  const [kbOpenFile, setKbOpenFile] = useState<{
    kbId: string;
    path: string;
    nonce: number;
  } | null>(null);
  // 知识库文件列表缓存（kbId → 展平后的文件列表），避免重复展开目录
  const kbFilesCacheRef = useRef<Map<string, FileEntry[]>>(new Map());

  /** 深度优先展平知识库目录树，只保留文件节点 */
  const flattenKbEntries = useCallback((entries: FileEntry[]): FileEntry[] => {
    const out: FileEntry[] = [];
    const walk = (list: FileEntry[]) => {
      for (const entry of list) {
        if (entry.type === 'file') out.push(entry);
        if (entry.children?.length) walk(entry.children);
      }
    };
    walk(entries);
    return out;
  }, []);

  // 在当前 Agent 绑定的知识库中按路径/文件名查找引用文件
  const lookupKbCitation = useCallback(
    async (normalized: string): Promise<{ kbId: string; path: string } | null> => {
      for (const kb of selectedAgent?.knowledgeBases ?? []) {
        let files = kbFilesCacheRef.current.get(kb.id);
        if (!files) {
          const { data, error } = await client.get('/api/ai/knowledge-bases/:id/files', {
            params: { id: kb.id },
            query: { path: '.', depth: 10 },
          });
          if (error) continue;
          files = flattenKbEntries((data as FileEntry[] | undefined) ?? []);
          kbFilesCacheRef.current.set(kb.id, files);
        }
        const matched =
          files.find((f) => f.path === normalized) ??
          files.find((f) => f.path.endsWith(`/${normalized}`)) ??
          files.find((f) => f.name === normalized);
        if (matched) return { kbId: kb.id, path: matched.path };
      }
      return null;
    },
    [selectedAgent, flattenKbEntries],
  );

  // 点击消息底部引用来源：URL 引用新标签页打开，工作区文件切到文件页签预览，
  // 知识库文件切到知识库页签并选中该文件
  const handleCiteClick = useCallback(
    (name: string, url?: string) => {
      const normalized = name.trim();
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (!normalized) return;
      const matched =
        workspaceFiles.find((f) => f.path === normalized) ??
        workspaceFiles.find((f) => f.path.endsWith(`/${normalized}`)) ??
        workspaceFiles.find((f) => (f.path.split('/').pop() ?? '') === normalized);
      if (matched) {
        setOpenFileTarget({ path: matched.path, nonce: Date.now() });
        setActiveTab('files');
        return;
      }
      void lookupKbCitation(normalized).then((result) => {
        if (!result) {
          msg.info('该引用文件不在当前会话工作区');
          return;
        }
        setKbOpenFile({ ...result, nonce: Date.now() });
        setActiveTab('knowledge');
      });
    },
    [workspaceFiles, lookupKbCitation],
  );

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

  // 模型白名单同步：当前模型不在所选 Agent 白名单内时，回退到白名单内第一个模型；
  // 模型列表就绪后应用 Agent 配置的默认思考强度（仅当前模型支持思考时生效）
  useEffect(() => {
    if (!selectedAgent || dbModels.length === 0) return;
    if (selectedAgent.models.length > 0 && !selectedAgent.models.includes(currentModel.id)) {
      const found = dbModels.find((m) => selectedAgent.models.includes(m.id));
      if (found) {
        setCurrentModel(found);
        return; // 模型切换后 effect 会以新模型重新执行
      }
    }
    const pending = pendingThinkingRef.current;
    if (pending === null) return;
    pendingThinkingRef.current = null;
    const model = dbModels.find((m) => m.id === currentModel.id);
    // Agent 默认档位同样必须落在模型声明的档位内，否则回落到 off（模型端配置是唯一权威）
    setThinkingLevel(model && allowedThinkingLevels(model).includes(pending) ? pending : 'off');
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
      // 同步到路径参数，刷新后可恢复；链接带 ?s= 时暂留，交给恢复逻辑消费
      const pendingSession = pendingUrlSessionRef.current;
      navigate(
        pendingSession
          ? `/app/ai/chat/${agent.id}?s=${pendingSession}`
          : `/app/ai/chat/${agent.id}`,
        { replace: true },
      );

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
            config?: Record<string, unknown> | null;
          };
        };

        if (detail) {
          const toolList = detail.tools ?? [];
          const skillIds = detail.skillIds ?? [];
          const mcpIds = detail.mcpServerIds ?? [];
          const kbIds = detail.knowledgeBaseIds ?? [];

          // Agent 配置的默认思考强度：暂存，等模型列表就绪后应用（见白名单同步 effect）
          const cfgDefault =
            (detail as { defaultThinkingLevel?: unknown }).defaultThinkingLevel ??
            detail.config?.defaultThinkingLevel;
          pendingThinkingRef.current =
            cfgDefault === 'minimal' ||
            cfgDefault === 'low' ||
            cfgDefault === 'medium' ||
            cfgDefault === 'high' ||
            cfgDefault === 'xhigh'
              ? cfgDefault
              : 'off';

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
      if (
        currentIds.length === matchedIds.length &&
        currentIds.every((id, index) => id === matchedIds[index])
      ) {
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

  /** 拉取并重建会话历史：切换会话与「刷新后确认审批」后的重拉共用 */
  const loadHistory = useCallback(async (threadId: string): Promise<void> => {
    try {
      const { data } = (await client.get('/api/ai/conversations/:id/messages', {
        params: { id: threadId },
      })) as {
        data?: Array<{ role: string; content: string; model?: string; reasoning?: string }>;
      };
      // 历史回显与流式渲染对齐：同一轮运行中连续持久化的 assistant 消息（每轮迭代一条）
      // 合并成一个气泡；role:'tool' 消息按持久化顺序还原为可展开的工具块；
      // role:'approval' 为审批台账条目（后端合成行），还原为审批状态卡片
      const history: ChatMessage[] = [];
      for (const m of data ?? []) {
        if (m.role === 'user') {
          history.push({
            id: crypto.randomUUID(),
            role: 'user',
            content: m.content,
            timestamp: '',
          });
          continue;
        }
        if (m.role === 'tool') {
          const block = parsePersistedTool(m.content);
          const last = history[history.length - 1];
          if (block && last?.role === 'assistant') {
            last.blocks = [...(last.blocks ?? []), block];
          }
          continue;
        }
        if (m.role === 'approval') {
          const approval = parsePersistedApproval(m.content);
          const last = history[history.length - 1];
          if (approval && last?.role === 'assistant') {
            last.approval = approval;
            // 待审批：补一个运行中的工具块（id 与审批单对齐，状态行据此标注），
            // 让用户看清在等哪个工具
            if (approval.status === 'pending') {
              last.blocks = [
                ...(last.blocks ?? []),
                {
                  type: 'tool',
                  id: approval.toolCallId ?? approval.id,
                  name: toolDisplayName(approval.toolName),
                  status: 'running',
                },
              ];
            }
          }
          continue;
        }
        if (m.role !== 'assistant') continue;
        const text = parsePersistedAssistant(m.content);
        const last = history[history.length - 1];
        if (last?.role === 'assistant') {
          last.blocks = [
            ...(last.blocks ?? []),
            ...(text ? [{ type: 'text' as const, text }] : []),
          ];
          last.content = text ? `${last.content}\n\n${text}` : last.content;
          if (m.model) last.model = m.model; // 同一轮多轮迭代以最后一次生成模型为准
          // 同一轮多轮迭代的思考内容依次拼接，对齐流式期间累积在同一气泡的展示
          if (m.reasoning)
            last.thinking = [last.thinking, m.reasoning].filter(Boolean).join('\n\n');
        } else {
          history.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: text,
            timestamp: '',
            blocks: [...(text ? [{ type: 'text' as const, text }] : [])],
            ...(m.model ? { model: m.model } : {}),
            ...(m.reasoning ? { thinking: m.reasoning } : {}),
          });
        }
      }
      setMessages(history);
    } catch {
      /* 历史加载失败保持空 */
    }
  }, []);

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
      await loadHistory(threadId);
    },
    [selectedAgent, loadHistory],
  );

  // 链接带 ?s=xxx：Agent 就绪后恢复该会话（只消费一次；消费前不让 URL 同步覆盖它）
  useEffect(() => {
    const pending = pendingUrlSessionRef.current;
    if (!pending || !selectedAgent) return;
    pendingUrlSessionRef.current = null;
    void handleSelectThread(pending);
  }, [selectedAgent, handleSelectThread]);

  // 当前会话同步到 URL：刷新或分享链接可直接回到会话
  useEffect(() => {
    if (!selectedAgent || pendingUrlSessionRef.current) return;
    const base = `/app/ai/chat/${selectedAgent.id}`;
    navigate(sessionId ? `${base}?s=${sessionId}` : base, { replace: true });
  }, [sessionId, selectedAgent, navigate]);

  // 消息完成后刷新工作区文件
  useEffect(() => {
    if (sessionId && !loading) fetchWorkspaceFiles(sessionId);
  }, [messages, loading, sessionId, fetchWorkspaceFiles]);

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
    async (content: string, options?: { truncateUserMessages?: number }) => {
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
        blocks: [],
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
        runMode,
        attachmentPaths: attachments.map((file) => file.path),
        ...(options?.truncateUserMessages === undefined
          ? {}
          : { truncateUserMessages: options.truncateUserMessages }),
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
              prev.map((msg) => {
                if (msg.id !== assistantMessage.id) return msg;
                // 文本增量追加到最后一个 text 块（与工具块按到达顺序交错）；
                // 工具块之后新开的文本段剥掉模型输出的前导换行，避免块间出现空行
                const blocks = [...(msg.blocks ?? [])];
                const last = blocks[blocks.length - 1];
                if (last?.type === 'text') {
                  blocks[blocks.length - 1] = { type: 'text', text: last.text + delta };
                } else {
                  const trimmed = delta.replace(/^\n+/, '');
                  if (trimmed) blocks.push({ type: 'text', text: trimmed });
                }
                return { ...msg, content: msg.content + delta, blocks };
              }),
            );
          },
          onReasoning: (delta) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, thinking: (msg.thinking ?? '') + delta }
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
                      blocks: [
                        ...(msg.blocks ?? []),
                        {
                          type: 'tool' as const,
                          id: toolCall.id || crypto.randomUUID(),
                          name: toolDisplayName(toolCall.name),
                          status: 'running' as const,
                          ...(toolCall.arguments === undefined
                            ? {}
                            : { arguments: JSON.stringify(toolCall.arguments, null, 2) }),
                        },
                      ],
                    }
                  : msg,
              ),
            );
          },
          onToolResult: (result) => {
            // 工具真实结束时立即收敛状态与耗时（后端 tool_result 事件，不等会话结束）
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessage.id) return msg;
                let looseMatched = false;
                const blocks = msg.blocks?.map((b) => {
                  if (b.type !== 'tool') return b;
                  const idMatch = b.id === result.toolCallId;
                  // provider 未返回 tool_call_id 时按「同名 + running」兜底匹配一次
                  const looseMatch =
                    !result.toolCallId &&
                    !looseMatched &&
                    b.status === 'running' &&
                    b.name === toolDisplayName(result.toolName);
                  if (looseMatch) looseMatched = true;
                  return idMatch || looseMatch
                    ? {
                        ...b,
                        status: result.isError ? ('error' as const) : ('completed' as const),
                        durationMs: result.durationMs,
                        ...(result.output === undefined ? {} : { output: result.output }),
                        // 非人工放行（自动审批/信任模式）在工具块上标注，便于事后追溯
                        ...(result.approval === undefined ? {} : { approval: result.approval }),
                      }
                    : b;
                });
                return { ...msg, blocks };
              }),
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
            // 双写：消息级 tokensUsed（消息下方展示）+ 全局累计（上下文用量）
            setTotalTokens((prev) => ({
              input: prev.input + usage.promptTokens,
              output: prev.output + usage.completionTokens,
            }));
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      tokensUsed: {
                        input: (msg.tokensUsed?.input ?? 0) + usage.promptTokens,
                        output: (msg.tokensUsed?.output ?? 0) + usage.completionTokens,
                      },
                    }
                  : msg,
              ),
            );
          },
          onSession: (sid) => {
            // 新建会话时后端下发 sessionId，绑定以便后续消息延续同一会话
            setSessionId(sid);
            setActiveThreadId(sid);
          },
          onTitle: (title) => {
            // 会话总结模型生成的标题：更新左侧会话列表
            setThreads((prev) =>
              prev.map((t) => (t.id === sessionIdRef.current ? { ...t, title } : t)),
            );
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
          onApprovalResolved: (resolved) => {
            // 审批结论（通过/被拒/超时过期）：立即收敛弹窗状态，避免超时后弹窗关不掉；
            // 未通过时把该审批对应的工具块标为失败（刷新恢复出的工具块 id 就是审批单 id）
            setMessages((prev) =>
              prev.map((msg) =>
                msg.approval?.id === resolved.approvalId
                  ? {
                      ...msg,
                      approval: {
                        ...msg.approval,
                        status: resolved.status,
                        ...(resolved.reason ? { reason: resolved.reason } : {}),
                      },
                      ...(resolved.status === 'approved'
                        ? {}
                        : {
                            blocks: msg.blocks?.map((block) =>
                              block.type === 'tool' &&
                              (block.id === msg.approval?.toolCallId ||
                                block.id === resolved.approvalId)
                                ? { ...block, status: 'error' as const }
                                : block,
                            ),
                          }),
                    }
                  : msg,
              ),
            );
          },
          onError: (error) => {
            // 标记所有 running 工具块为 error
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      content: msg.content + `\n\n❌ 错误: ${error.message}`,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) =>
                        b.type === 'tool' && b.status === 'running'
                          ? { ...b, status: 'error' as const }
                          : b,
                      ),
                    }
                  : msg,
              ),
            );
            setLoading(false);
          },
          onDone: () => {
            const now = Date.now();
            // 兜底：未收到 tool_result 的 running 工具块按本地计时收敛
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) =>
                        b.type === 'tool' && b.status === 'running'
                          ? {
                              ...b,
                              status: 'completed' as const,
                              durationMs: now - (stepTimers.get(b.id) ?? now),
                            }
                          : b,
                      ),
                    }
                  : msg,
              ),
            );
            setLoading(false);
            void fetchThreads();
            setAttachments([]);
            // 运行模式只对本次发送生效：结束即回到默认「需要审批」
            setRunMode('ask');
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
      runMode,
      attachments,
      fetchThreads,
    ],
  );

  const handleAttach = useCallback(
    async (files: File[]): Promise<void> => {
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
    },
    [selectedAgent, attachments.length, sessionId, fetchWorkspaceFiles],
  );

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
      // 「刷新后确认」场景（本页无进行中的流）：后端 run 仍在后台等待，确认后会继续执行该工具，
      // 稍后重拉历史把执行结果带进页面（流内确认则由 SSE 的 tool_result 自然回填）。
      // 跑两次：工具执行有延迟，第一次可能还没落盘
      const target = sessionIdRef.current;
      if (!loading && target) {
        for (const delay of [3000, 9000]) {
          setTimeout(() => {
            if (sessionIdRef.current === target) void loadHistory(target);
          }, delay);
        }
      }
      return true;
    },
    [loading, loadHistory],
  );

  // Stop generation：显式停止必须先通知后端（断开/刷新不会取消运行，见 sse.ts）
  const handleStop = useCallback(() => {
    const target = sessionIdRef.current;
    if (target) {
      void client.post('/api/ai/chat/sessions/:id/stop', { params: { id: target } });
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.isStreaming
          ? {
              ...msg,
              isStreaming: false,
              content: msg.content || '（已停止）',
              // 停止即本次审批作废：后端把审批单落为过期且工具不执行，
              // 本地同步收敛弹窗（停止后流已断开，收不到 approval_resolved）
              ...(msg.approval?.status === 'pending'
                ? {
                    approval: {
                      ...msg.approval,
                      status: 'expired' as const,
                      reason: '已停止生成，该工具未执行',
                    },
                  }
                : {}),
              blocks: msg.blocks?.map((block) =>
                block.type === 'tool' && block.status === 'running'
                  ? { ...block, status: 'error' as const }
                  : block,
              ),
            }
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

  // 删除会话（移入回收站）
  const handleDeleteThread = useCallback(
    async (id: string) => {
      const { error } = await client.delete('/api/ai/conversations/:id', { params: { id } });
      if (!error) {
        msg.success('已移入回收站');
        if (activeThreadId === id) handleNewChat();
        void fetchThreads();
      }
    },
    [activeThreadId, handleNewChat, fetchThreads],
  );

  // 重命名会话：成功后本地先行更新，避免等待列表刷新
  const handleRenameThread = useCallback(async (id: string, title: string) => {
    const { error } = await client.patch('/api/ai/conversations/:id', {
      params: { id },
      body: { title },
    });
    if (!error) {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    }
  }, []);

  // Regenerate last assistant message
  const handleRegenerate = useCallback(
    (messageId: string) => {
      // 找到该 assistant 消息之前的最后一条 user 消息
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;
      // 移除该 assistant 消息
      const newMessages = messages.slice(0, msgIndex);
      const lastUserIndex = newMessages.findLastIndex((m) => m.role === 'user');
      if (lastUserIndex < 0) return;
      const lastUserMsg = newMessages[lastUserIndex]!;
      setMessages(newMessages);
      // 后端同步截断会话历史：仅保留该 user 消息之前的轮次，丢弃旧回复
      const keepUserMessages = newMessages
        .slice(0, lastUserIndex)
        .filter((m) => m.role === 'user').length;
      // 重新发送
      handleSend(lastUserMsg.content, { truncateUserMessages: keepUserMessages });
    },
    [messages, handleSend],
  );

  // 编辑用户消息并重新发送：丢弃该消息及其后的所有消息，以新内容重新发送
  const handleEditResend = useCallback(
    (messageId: string, newContent: string) => {
      if (loading) return;
      const msgIndex = messages.findIndex((m) => m.id === messageId);
      if (msgIndex < 0) return;
      setMessages(messages.slice(0, msgIndex));
      // 后端同步截断会话历史：仅保留被编辑消息之前的轮次
      const keepUserMessages = messages.slice(0, msgIndex).filter((m) => m.role === 'user').length;
      handleSend(newContent, { truncateUserMessages: keepUserMessages });
    },
    [messages, handleSend, loading],
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
        {/* Thread List（可收起为窄栏） */}
        {threadListCollapsed ? (
          <div
            className="w-[44px] h-full flex flex-col items-center pt-3 gap-2 shrink-0"
            style={{
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setThreadListCollapsed(false)}
              title="展开会话列表"
            />
            <Button
              type="text"
              size="small"
              icon={<RestOutlined />}
              onClick={() => setTrashOpen(true)}
              title="回收站"
            />
          </div>
        ) : (
          <ThreadList
            threads={threads}
            activeId={activeThreadId ?? undefined}
            onSelect={handleSelectThread}
            onNew={handleNewChat}
            onDelete={handleDeleteThread}
            onRename={handleRenameThread}
            onLoadMore={handleLoadMoreThreads}
            hasMore={hasMoreThreads}
            loadingMore={loadingMoreThreads}
            onCollapse={() => setThreadListCollapsed(true)}
            onOpenTrash={() => setTrashOpen(true)}
          />
        )}

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
                onCiteClick={handleCiteClick}
                onEditResend={loading ? undefined : handleEditResend}
              />
            )}
            {activeTab === 'files' && (
              <div className="mx-auto h-full min-h-0 w-full max-w-[960px] px-4 flex flex-col">
                {selectedAgent.name === 'Skill Creator' &&
                  workspaceFiles.some((file) => file.path === 'SKILL.md') && (
                    <div className="px-4 pt-3 shrink-0">
                      <Button type="primary" onClick={() => setExportModalOpen(true)}>
                        导出为 Skill
                      </Button>
                    </div>
                  )}
                <div className="mt-4 flex-1 min-h-0  border rounded-lg">
                  <FilesPanel
                    files={workspaceFiles}
                    sessionId={sessionId}
                    openFile={openFileTarget}
                  />
                </div>
              </div>
            )}
            {activeTab === 'memory' && (
              <div className="mx-auto h-full min-h-0 w-full max-w-[960px] px-4">
                <MemoryPanel sessionId={sessionId} />
              </div>
            )}
            {activeTab === 'knowledge' && (
              <div className="mx-auto h-full min-h-0 w-full max-w-[960px] px-4">
                <KnowledgePanel
                  knowledgeBases={selectedAgent.knowledgeBases}
                  openFile={kbOpenFile}
                />
              </div>
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
              setAttachments((current) =>
                current.some((item) => item.path === file.path)
                  ? current
                  : [
                      ...current,
                      { path: file.path, name: file.path.split('/').pop() ?? file.path },
                    ],
              );
            }}
            onRemoveAttachment={(path) =>
              setAttachments((current) => current.filter((file) => file.path !== path))
            }
            onThinkingLevelChange={setThinkingLevel}
            runMode={runMode}
            onRunModeChange={setRunMode}
            skills={selectedAgent?.skills ?? []}
            onSelectSkill={(id) =>
              setEnabledSkills((current) => (current.includes(id) ? current : [...current, id]))
            }
            contextUsage={contextUsage}
            workspaceFiles={workspaceFiles}
          />
        </div>
      </div>

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

      {/* 回收站 */}
      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={() => void fetchThreads()}
      />
    </Card>
  );
}
