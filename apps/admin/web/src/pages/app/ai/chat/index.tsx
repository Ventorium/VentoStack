import { client } from "@/api";
import { streamChat, type ChatStreamParams } from "@/api/sse-client";
import { Card, Empty, Button, Space, Tag, Typography, theme, Spin } from "antd";
import { RobotOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // Fetch agents list
  useEffect(() => {
    setLoadingAgents(true);
    client.get("/api/ai/agents", { query: { pageSize: 100, status: "active" } })
      .then(({ data }) => {
        const list = (data as { list?: Array<{ id: string; name: string; description: string | null; model: string; systemPrompt: string; tools: string[] | null; skillIds: string[] | null; mcpServerIds: string[] | null; knowledgeBaseIds: string[] | null }> })?.list;
        if (list?.length) {
          // For each agent, we need to fetch full details including skills/mcp/kb names
          // For now, we'll use the list data and fetch details on selection
          const agentInfos: AgentInfo[] = list.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            model: a.model,
            systemPrompt: a.systemPrompt,
            tools: a.tools ?? [],
            skills: [], // Will be populated on selection
            mcpServers: [], // Will be populated on selection
            knowledgeBases: [], // Will be populated on selection
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

    // Fetch full agent details with skills/mcp/kb info
    try {
      const { data: detail } = await client.get("/api/ai/agents/:id", { params: { id: agent.id } }) as {
        data?: {
          tools: string[] | null;
          skills: Array<{ id: string; name: string; description: string | null }>;
          mcpServers: Array<{ id: string; name: string; description: string | null; toolCount: number }>;
          knowledgeBases: Array<{ id: string; name: string; description: string | null }>;
        };
      };

      if (detail) {
        const fullAgent: AgentInfo = {
          ...agent,
          tools: detail.tools ?? agent.tools,
          skills: detail.skills ?? [],
          mcpServers: detail.mcpServers ?? [],
          knowledgeBases: detail.knowledgeBases ?? [],
        };
        setSelectedAgent(fullAgent);
        // Enable all by default
        setEnabledTools(fullAgent.tools);
        setEnabledSkills(fullAgent.skills.map(s => s.id));
        setEnabledMcp(fullAgent.mcpServers.map(m => m.id));
        setEnabledKbs(fullAgent.knowledgeBases.map(k => k.id));
      }
    } catch {}
  }, [dbModels]);

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
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? {
                      ...msg,
                      steps: [
                        ...(msg.steps ?? []),
                        {
                          id: crypto.randomUUID(),
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
          onError: (error) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: msg.content + `\n\n❌ 错误: ${error.message}`, isStreaming: false }
                  : msg,
              ),
            );
            setLoading(false);
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessage.id ? { ...msg, isStreaming: false } : msg,
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
  }, []);

  // Context usage (mock)
  const contextUsage = {
    used: messages.reduce(
      (sum, m) => sum + (m.tokensUsed?.input ?? 0) + (m.tokensUsed?.output ?? 0),
      0,
    ) || 6200,
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
          <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>
        ) : agents.length === 0 ? (
          <Empty description="暂无可用的智能体，请先在 Agent 管理中创建">
            <Button type="primary" href="/app/ai/agents">前往创建</Button>
          </Empty>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {agents.map(agent => (
              <Card
                key={agent.id}
                hoverable
                onClick={() => handleSelectAgent(agent)}
                style={{ borderColor: token.colorBorderSecondary }}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space>
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 8,
                        background: token.colorPrimaryBg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <RobotOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
                    </div>
                    <div>
                      <Text strong>{agent.name}</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{agent.model}</Text>
                      </div>
                    </div>
                  </Space>
                  {agent.description && (
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ rows: 2 }}>
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
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Thread List */}
        <ThreadList
          threads={threads}
          activeId={activeThreadId ?? undefined}
          onSelect={setActiveThreadId}
          onNew={handleNewChat}
        />

        {/* Chat Column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* Chat Area */}
          <ChatArea messages={messages} agentName={selectedAgent.name} />

          {/* Bottom Input */}
          <BottomInput
            onSend={handleSend}
            onStop={handleStop}
            loading={loading}
            currentModel={currentModel}
            models={dbModels.length > 0 ? dbModels : [FALLBACK_MODEL]}
            onModelChange={setCurrentModel}
            contextUsage={contextUsage}
          />
        </div>
      </div>
    </Card>
  );
}
