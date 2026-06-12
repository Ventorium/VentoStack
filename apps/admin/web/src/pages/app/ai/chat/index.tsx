import { client } from "@/api";
import { streamChat, type ChatStreamParams } from "@/api/sse-client";
import { Card, theme } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ModelOption } from "./types";
import { MOCK_THREADS, MOCK_MESSAGES, MOCK_SKILLS } from "./mock-data";

import ThreadList from "./components/ThreadList";
import TopToolbar from "./components/TopToolbar";
import ChatArea from "./components/ChatArea";
import BottomInput from "./components/BottomInput";
import SkillsModal from "./components/SkillsModal";

/** Fallback model when DB has no models configured */
const FALLBACK_MODEL: ModelOption = {
  id: "default", name: "请先在 AI 配置中添加供应商和模型", provider: "", contextWindow: 128000,
};

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [threads] = useState(MOCK_THREADS);
  const [activeThreadId, setActiveThreadId] = useState("1");
  const [loading, setLoading] = useState(false);
  const [skillsVisible, setSkillsVisible] = useState(false);
  const [skills, setSkills] = useState(MOCK_SKILLS);
  const [currentModel, setCurrentModel] = useState<ModelOption>(FALLBACK_MODEL);
  const [dbModels, setDbModels] = useState<ModelOption[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { token } = theme.useToken();

  const agentName = "新助手";

  // Fetch models from DB + default model config
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const { data: models } = await client.get("/api/ai/models") as {
          data?: Array<{ modelId: string; displayName: string | null; providerName: string; contextLength: number }>;
        };
        if (models && models.length > 0) {
          const options: ModelOption[] = models.map((m) => ({
            id: m.modelId,
            name: m.displayName || m.modelId,
            provider: m.providerName,
            contextWindow: m.contextLength,
          }));
          setDbModels(options);

          // Try to use default model from config
          try {
            const { data: cfg } = await client.get("/api/ai/config/:key", { params: { key: "default_model" } }) as {
              data?: { value: string | null };
            };
            if (cfg?.value) {
              const found = options.find((o) => `${o.provider}/${o.id}` === cfg.value);
              if (found) setCurrentModel(found);
              else setCurrentModel(options[0]);
            } else {
              setCurrentModel(options[0]);
            }
          } catch {
            setCurrentModel(options[0]);
          }
        }
      } catch {}
    };
    fetchModels();
  }, []);

  // Send message
  const handleSend = useCallback(
    async (content: string) => {
      if (loading) return;

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
        agentId: "default",
        message: content,
        sessionId,
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
    [loading, currentModel, sessionId],
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

  // Toggle skill capability
  const handleToggleCapability = useCallback(
    (skillId: string, capabilityId: string, enabled: boolean) => {
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skillId
            ? {
                ...s,
                capabilities: s.capabilities.map((c) =>
                  c.id === capabilityId ? { ...c, enabled } : c,
                ),
                enabledCount: s.capabilities.reduce(
                  (sum, c) =>
                    sum + (c.id === capabilityId ? (enabled ? 1 : 0) : c.enabled ? 1 : 0),
                  0,
                ),
              }
            : s,
        ),
      );
    },
    [],
  );

  // Context usage (mock)
  const contextUsage = {
    used: messages.reduce(
      (sum, m) => sum + (m.tokensUsed?.input ?? 0) + (m.tokensUsed?.output ?? 0),
      0,
    ) || 6200,
    total: currentModel.contextWindow,
  };

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
        agentName={agentName}
        onOpenSkills={() => setSkillsVisible(true)}
      />

      {/* Main Body: Thread List + Chat */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Thread List */}
        <ThreadList
          threads={threads}
          activeId={activeThreadId}
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
          <ChatArea messages={messages} agentName={agentName} />

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

      {/* Skills Modal */}
      <SkillsModal
        visible={skillsVisible}
        skills={skills}
        onClose={() => setSkillsVisible(false)}
        onToggleCapability={handleToggleCapability}
      />
    </Card>
  );
}
