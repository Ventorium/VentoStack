import {
  AuditOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  FileOutlined,
  FolderOutlined,
  SendOutlined,
  SoundOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Space, Tabs, Tag, theme, Tooltip, Typography } from "antd";
import { useCallback, useRef, useState } from "react";
import type { ModelOption } from "../types";

const { Text } = Typography;

interface BottomTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface BottomInputProps {
  onSend?: (message: string) => void;
  onStop?: () => void;
  loading?: boolean;
  currentModel?: ModelOption;
  models?: ModelOption[];
  onModelChange?: (model: ModelOption) => void;
  contextUsage?: { used: number; total: number };
}

const BOTTOM_TABS: BottomTab[] = [
  { key: "chat", label: "对话", icon: <SoundOutlined /> },
  { key: "files", label: "文件", icon: <FileOutlined />, count: 1 },
  { key: "memory", label: "记忆", icon: <DatabaseOutlined />, count: 1 },
  { key: "knowledge", label: "知识库", icon: <DatabaseOutlined />, count: 1 },
  { key: "mapping", label: "目录映射", icon: <FolderOutlined />, count: 1 },
  { key: "scheduler", label: "定时任务", icon: <ClockCircleOutlined /> },
  { key: "terminal", label: "终端", icon: <ToolOutlined /> },
  { key: "audit", label: "审计", icon: <AuditOutlined /> },
];

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function BottomInput({
  onSend,
  onStop,
  loading = false,
  currentModel,
  models = [],
  onModelChange,
  contextUsage,
}: BottomInputProps) {
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend?.(trimmed);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, loading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      {/* Function Tabs */}
      <div style={{ padding: "8px 16px 0", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={BOTTOM_TABS.map((tab) => ({
            key: tab.key,
            label: (
              <Space size={4}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <Tag style={{ fontSize: 10, lineHeight: "14px", padding: "0 4px", margin: 0 }}>
                    {tab.count}
                  </Tag>
                )}
              </Space>
            ),
          }))}
          style={{ marginBottom: 0 }}
        />
      </div>

      {/* Input Area */}
      <div style={{ padding: "10px 16px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadiusLG,
            padding: "8px 12px",
            background: token.colorBgContainer,
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = token.colorPrimary;
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = token.colorBorder;
          }}
        >
          {/* Model Selector */}
          <Dropdown
            menu={{
              items: models.map((m) => ({
                key: m.id,
                label: (
                  <div>
                    <div style={{ fontSize: 13 }}>{m.name}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.provider}</Text>
                  </div>
                ),
              })),
              selectedKeys: currentModel ? [currentModel.id] : [],
              onClick: ({ key }) => {
                const model = models.find((m) => m.id === key);
                if (model) onModelChange?.(model);
              },
            }}
            trigger={["click"]}
          >
            <Text
              style={{
                fontSize: 12,
                color: token.colorTextSecondary,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {currentModel?.name || "选择模型"} ▾
            </Text>
          </Dropdown>

          <div style={{ width: 1, height: 20, background: token.colorBorderSecondary, flexShrink: 0 }} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息...（Enter 发送, Shift+Enter 换行）"
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: token.colorText,
              fontSize: 13,
              lineHeight: "20px",
              minHeight: 20,
              maxHeight: 120,
              fontFamily: "inherit",
            }}
          />

          {/* Right Actions */}
          <Space size={6} style={{ flexShrink: 0 }}>
            {contextUsage && (
              <Tooltip title={`上下文：${formatTokens(contextUsage.used)} / ${formatTokens(contextUsage.total)}`}>
                <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {formatTokens(contextUsage.used)} / {formatTokens(contextUsage.total)}
                </Text>
              </Tooltip>
            )}

            <Tooltip title="语音输入">
              <Button type="text" size="small" icon={<SoundOutlined />} />
            </Tooltip>

            {loading ? (
              <Button
                type="primary"
                danger
                size="small"
                icon={<SendOutlined />}
                onClick={onStop}
              >
                停止
              </Button>
            ) : (
              <Button
                type="primary"
                size="small"
                icon={<SendOutlined />}
                onClick={handleSend}
                disabled={!input.trim()}
              >
                发送
              </Button>
            )}
          </Space>
        </div>
      </div>
    </div>
  );
}
