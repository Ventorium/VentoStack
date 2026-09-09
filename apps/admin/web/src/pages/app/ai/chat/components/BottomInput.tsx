import {
  ArrowUpOutlined,
  DatabaseOutlined,
  FileOutlined,
  PlusOutlined,
  SoundOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Select, Space, Tabs, Tag, Tooltip, Typography, theme } from 'antd';
import { useCallback, useRef, useState } from 'react';
import type { ModelOption } from '../types';

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
  activeTab?: string;
  onTabChange?: (key: string) => void;
  onSend?: (message: string) => void;
  onStop?: () => void;
  loading?: boolean;
  currentModel?: ModelOption;
  models?: ModelOption[];
  onModelChange?: (model: ModelOption) => void;
  contextUsage?: { used: number; total: number };
  workspaceFiles?: WorkspaceFile[];
}

const BOTTOM_TABS: BottomTab[] = [
  { key: 'chat', label: '对话', icon: <SoundOutlined /> },
  { key: 'files', label: '文件', icon: <FileOutlined /> },
  { key: 'memory', label: '记忆', icon: <DatabaseOutlined /> },
  { key: 'knowledge', label: '知识库', icon: <DatabaseOutlined /> },
];

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function BottomInput({
  activeTab: controlledActiveTab,
  onTabChange,
  onSend,
  onStop,
  loading = false,
  currentModel,
  models = [],
  onModelChange,
  contextUsage,
  workspaceFiles = [],
}: BottomInputProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [localActiveTab, setLocalActiveTab] = useState('chat');
  const activeTab = controlledActiveTab ?? localActiveTab;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend?.(trimmed);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, loading, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="shrink-0 px-3 pb-4 sm:px-6" style={{ background: token.colorBgContainer }}>
      {/* Function Tabs */}
      <div className="mx-auto max-w-[960px] pt-2">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setLocalActiveTab(key);
            onTabChange?.(key);
          }}
          size="small"
          items={BOTTOM_TABS.map((tab) => ({
            key: tab.key,
            label: (
              <Space size={4}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.key === 'files' && workspaceFiles.length > 0 && (
                  <Tag className="text-[10px] m-0 leading-[14px] px-1 py-0">
                    {workspaceFiles.length}
                  </Tag>
                )}
              </Space>
            ),
          }))}
          className="mb-0 pl-5 [&_.ant-tabs-nav]:mb-2 [&_.ant-tabs-nav]:before:border-none"
        />
      </div>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <div className="mx-auto max-w-[960px]">
          <div
            className="flex flex-col gap-3 rounded-[24px] border border-solid px-4 pt-4 pb-3 transition-colors sm:px-5"
            style={{ borderColor: token.colorBorder, background: token.colorBgContainer }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = token.colorPrimary;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                e.currentTarget.style.borderColor = token.colorBorder;
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              aria-label="聊天消息"
              placeholder="今天想聊些什么？"
              rows={3}
              className="w-full box-border min-h-[72px] max-h-[120px] resize-none border-none bg-transparent p-0 text-sm leading-6 outline-none font-inherit"
              style={{ color: token.colorText }}
            />
            <div className="flex items-end justify-between gap-2">
              <Tooltip title="当前对话暂不支持附件上传">
                <span>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<PlusOutlined />}
                    aria-label="添加附件（暂不支持）"
                    disabled
                  />
                </span>
              </Tooltip>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
                {/* Model Selector */}
                <Select
                  size="small"
                  variant="borderless"
                  aria-label="选择模型"
                  className="min-w-[100px] max-w-[180px] sm:max-w-[240px]"
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
                    return [...groups.entries()].map(([provider, opts]) => ({
                      label: provider,
                      options: opts,
                    }));
                  })()}
                />

                <Tooltip title="当前对话使用智能体默认思考设置，暂不支持按次调整">
                  <span>
                    <Select
                      aria-label="思考强度"
                      size="small"
                      variant="borderless"
                      disabled
                      value="default"
                      className="w-[112px]"
                      options={[{ value: 'default', label: '思考强度' }]}
                    />
                  </span>
                </Tooltip>

                {/* Right Actions */}
                <Space size={6} className="shrink-0">
                  {contextUsage && (
                    <Tooltip
                      title={`上下文：${formatTokens(contextUsage.used)} / ${formatTokens(contextUsage.total)}`}
                    >
                      <Text type="secondary" className="text-[11px] whitespace-nowrap">
                        {formatTokens(contextUsage.used)} / {formatTokens(contextUsage.total)}
                      </Text>
                    </Tooltip>
                  )}

                  {loading ? (
                    <Button
                      type="primary"
                      shape="circle"
                      aria-label="停止生成"
                      icon={<StopOutlined />}
                      onClick={onStop}
                    />
                  ) : (
                    <Button
                      type="primary"
                      shape="circle"
                      aria-label="发送消息"
                      icon={<ArrowUpOutlined />}
                      onClick={handleSend}
                      disabled={!input.trim()}
                    />
                  )}
                </Space>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'chat' && (
        <div className="mt-2 text-center text-[11px]" style={{ color: token.colorTextQuaternary }}>
          Enter 发送 · Shift + Enter 换行
        </div>
      )}
    </div>
  );
}
