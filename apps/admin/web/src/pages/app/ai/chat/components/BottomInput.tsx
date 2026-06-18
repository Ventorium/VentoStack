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
import { Button, Select, Space, Tabs, Tag, theme, Tooltip, Typography } from "antd";
import { useCallback, useRef, useState } from "react";
import type { ModelOption } from "../types";

const { Text } = Typography;

interface BottomTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface WorkspaceFile {
  path: string;
  size: number;
  modifiedAt: string;
}

interface BottomInputProps {
  onSend?: (message: string) => void;
  onStop?: () => void;
  loading?: boolean;
  currentModel?: ModelOption;
  models?: ModelOption[];
  onModelChange?: (model: ModelOption) => void;
  contextUsage?: { used: number; total: number };
  workspaceFiles?: WorkspaceFile[];
  isSkillCreator?: boolean;
  onExportSkill?: () => void;
  onPreviewFile?: (path: string) => void;
}

const BOTTOM_TABS: BottomTab[] = [
  { key: "chat", label: "对话", icon: <SoundOutlined /> },
  { key: "files", label: "文件", icon: <FileOutlined /> },
  { key: "memory", label: "记忆", icon: <DatabaseOutlined /> },
  { key: "knowledge", label: "知识库", icon: <DatabaseOutlined /> },
  { key: "mapping", label: "目录映射", icon: <FolderOutlined /> },
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
  workspaceFiles = [],
  isSkillCreator = false,
  onExportSkill,
  onPreviewFile,
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
      className="shrink-0" style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
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
                {tab.key === "files" && workspaceFiles.length > 0 && (
                  <Tag className="text-[10px] m-0" style={{ lineHeight: "14px", padding: "0 4px" }}>
                    {workspaceFiles.length}
                  </Tag>
                )}
              </Space>
            ),
          }))}
          className="mb-0"
        />
      </div>

      {/* Files Tab Content */}
      {activeTab === "files" ? (
        <div className="max-h-[240px] overflow-auto py-[8px] px-[16px]" >
          {workspaceFiles.length === 0 ? (
            <Text type="secondary" className="text-xs">暂无文件。与 AI 对话时创建的文件将显示在这里。</Text>
          ) : (
            <div className="flex flex-col gap-0.5">
              {workspaceFiles.map((f) => (
                <div
                  key={f.path}
                  onClick={() => onPreviewFile?.(f.path)}
                  className="cursor-pointer flex items-center gap-2 text-xs" style={{ padding: "4px 8px", borderRadius: token.borderRadiusSM }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = token.controlItemBgHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <FileOutlined className="text-xs" style={{ color: token.colorTextSecondary }} />
                  <Text ellipsis className="flex-1 text-xs">{f.path}</Text>
                  <Text type="secondary" className="text-[11px]">{(f.size / 1024).toFixed(1)}K</Text>
                </div>
              ))}
            </div>
          )}
          {isSkillCreator && workspaceFiles.some(f => f.path === "SKILL.md") && (
            <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
              <Button type="primary" size="small" block onClick={onExportSkill}>
                导出为 Skill
              </Button>
            </div>
          )}
        </div>
      ) : (
      /* Input Area */
      <div style={{ padding: "10px 16px 12px" }}>
        <div
          className="flex items-end gap-2.5" style={{ border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadiusLG, padding: "8px 12px", background: token.colorBgContainer, transition: "border-color 0.2s" }}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = token.colorPrimary;
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = token.colorBorder;
          }}
        >
          {/* Model Selector */}
          <Select
            size="small"
            variant="borderless"
            className="min-w-[120px] max-w-[160px]"
            placeholder="选择模型"
            value={currentModel?.id}
            onChange={(value) => {
              const model = models.find((m) => m.id === value);
              if (model) onModelChange?.(model);
            }}
            showSearch
            popupMatchSelectWidth={240}
            options={(() => {
              const groups = new Map<string, Array<{ label: string; value: string }>>();
              for (const m of models) {
                if (!groups.has(m.provider)) groups.set(m.provider, []);
                groups.get(m.provider)!.push({ label: m.name, value: m.id });
              }
              return [...groups.entries()].map(([provider, opts]) => ({ label: provider, options: opts }));
            })()}
          />

          <div className="w-px h-5 shrink-0" style={{ background: token.colorBorderSecondary }} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息...（Enter 发送, Shift+Enter 换行）"
            rows={1}
            className="flex-1 border-none text-[13px] min-h-5 max-h-[120px]" style={{ background: "transparent", outline: "none", resize: "none", color: token.colorText, lineHeight: "20px", fontFamily: "inherit" }}
          />

          {/* Right Actions */}
          <Space size={6} className="shrink-0">
            {contextUsage && (
              <Tooltip title={`上下文：${formatTokens(contextUsage.used)} / ${formatTokens(contextUsage.total)}`}>
                <Text type="secondary" className="text-[11px] whitespace-nowrap">
                  {formatTokens(contextUsage.used)} / {formatTokens(contextUsage.total)}
                </Text>
              </Tooltip>
            )}

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
      )}
    </div>
  );
}
