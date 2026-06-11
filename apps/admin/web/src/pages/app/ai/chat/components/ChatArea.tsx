import {
  CopyOutlined,
  DislikeOutlined,
  LikeOutlined,
  ReloadOutlined,
  RobotOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Divider, Empty, Space, theme, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import AgentSteps from "./AgentSteps";

const { Text, Paragraph } = Typography;

interface ChatAreaProps {
  messages: ChatMessage[];
  agentName?: string;
}

/** 行内渲染：加粗 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/** 简易 Markdown 风格渲染 */
function renderContent(content: string, token: ReturnType<typeof theme.useToken>["token"]): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\|[\s\-:|]+\|$/.test(line)) continue;

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (!inTable) {
        inTable = true;
        elements.push(
          <div
            key={`tbl-h-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              paddingBottom: 4,
              marginBottom: 2,
            }}
          >
            {cells.map((c, ci) => (
              <Text key={ci} strong style={{ fontSize: 12, padding: "2px 8px" }}>
                {renderInline(c)}
              </Text>
            ))}
          </div>,
        );
      } else {
        elements.push(
          <div
            key={`tbl-r-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
              marginBottom: 2,
            }}
          >
            {cells.map((c, ci) => (
              <Text key={ci} style={{ fontSize: 13, padding: "2px 8px" }}>
                {renderInline(c)}
              </Text>
            ))}
          </div>,
        );
      }
      continue;
    } else {
      inTable = false;
    }

    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} style={{ height: 8 }} />);
      continue;
    }

    if (line.startsWith("• ") || line.startsWith("- ")) {
      elements.push(
        <div key={`li-${i}`} style={{ display: "flex", gap: 8, paddingLeft: 4, marginBottom: 2 }}>
          <span style={{ color: token.colorPrimary, flexShrink: 0 }}>•</span>
          <Text style={{ fontSize: 13 }}>{renderInline(line.replace(/^[•\-]\s*/, ""))}</Text>
        </div>,
      );
      continue;
    }

    elements.push(
      <Text key={`p-${i}`} style={{ fontSize: 13, display: "block", lineHeight: "22px", marginBottom: 2 }}>
        {renderInline(line)}
      </Text>,
    );
  }

  return elements;
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function MessageActions() {
  return (
    <Space size={2} style={{ marginTop: 8 }}>
      {[
        { icon: <CopyOutlined />, tip: "复制" },
        { icon: <ReloadOutlined />, tip: "重新生成" },
        { icon: <LikeOutlined />, tip: "有用" },
        { icon: <DislikeOutlined />, tip: "无用" },
      ].map((a) => (
        <Tooltip key={a.tip} title={a.tip}>
          <Button type="text" size="small" icon={a.icon} style={{ color: "inherit", opacity: 0.5 }} />
        </Tooltip>
      ))}
    </Space>
  );
}

export default function ChatArea({ messages, agentName = "新助手" }: ChatAreaProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Avatar
          size={64}
          style={{
            background: token.colorPrimary,
            borderRadius: token.borderRadiusLG,
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          {agentName.slice(0, 1)}
        </Avatar>
        <Text strong style={{ fontSize: 20 }}>
          {agentName}
        </Text>
        <Text type="secondary" style={{ fontSize: 14, maxWidth: 400, textAlign: "center" }}>
          有什么可以帮助你的？可以问我任何问题，或者让我帮你执行任务。
        </Text>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 0" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 16px" }}>
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 20,
                flexDirection: isUser ? "row-reverse" : "row",
              }}
            >
              {/* Avatar */}
              {isUser ? (
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: token.colorPrimaryBg, color: token.colorPrimary, flexShrink: 0 }}
                />
              ) : (
                <Avatar
                  size={32}
                  style={{
                    background: token.colorPrimary,
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {agentName.slice(0, 2)}
                </Avatar>
              )}

              {/* Content */}
              <div style={{ flex: 1, maxWidth: isUser ? "70%" : "100%", minWidth: 0 }}>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    display: "block",
                    marginBottom: 4,
                    textAlign: isUser ? "right" : "left",
                  }}
                >
                  {isUser ? "你" : agentName}
                </Text>

                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: token.borderRadiusLG,
                    background: isUser ? token.colorFillSecondary : token.colorFillQuaternary,
                    border: isUser ? "none" : `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  {!isUser && msg.steps && msg.steps.length > 0 && (
                    <AgentSteps steps={msg.steps} />
                  )}

                  <div>{renderContent(msg.content, token)}</div>

                  {msg.isStreaming && (
                    <Space size={4} style={{ marginTop: 8 }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: token.colorPrimary,
                            opacity: 0.6,
                            animation: `chat-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </Space>
                  )}
                </div>

                {!isUser && !msg.isStreaming && (
                  <>
                    <MessageActions />
                    {(msg.model || msg.tokensUsed) && (
                      <Space size={8} style={{ marginTop: 6 }}>
                        {msg.model && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            <RobotOutlined style={{ marginRight: 4 }} />
                            {msg.model}
                          </Text>
                        )}
                        {msg.tokensUsed && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {formatTokenCount(msg.tokensUsed.input)} / {formatTokenCount(msg.tokensUsed.output)} tokens
                          </Text>
                        )}
                      </Space>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <style>{`
        @keyframes chat-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
