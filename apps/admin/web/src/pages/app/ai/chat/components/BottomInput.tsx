import {
  ArrowUpOutlined,
  BulbOutlined,
  DownOutlined,
  FileOutlined,
  PlusOutlined,
  RobotOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { App, Button, Popover, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ModelOption } from '../types';
import RunModeSelect, { type RunMode } from './RunModeSelect';

const { Text } = Typography;

interface WorkspaceFile {
  path: string;
  size: number;
  modifiedAt: string;
}

interface BottomInputProps {
  /** 页签已挪到顶部工具栏，本组件仅在 'chat' 页签下渲染输入区 */
  activeTab?: string;
  onSend?: (message: string) => void;
  onStop?: () => void;
  loading?: boolean;
  currentModel?: ModelOption;
  /** 可切换的模型列表（当前 Agent 白名单内） */
  models?: ModelOption[];
  onModelChange?: (model: ModelOption) => void;
  contextUsage?: { used: number; total: number };
  workspaceFiles?: WorkspaceFile[];
  attachments?: Array<{ path: string; name: string }>;
  uploadingAttachment?: boolean;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  onAttach?: (files: File[]) => void;
  onAttachWorkspaceFile?: (file: WorkspaceFile) => void;
  onRemoveAttachment?: (path: string) => void;
  onThinkingLevelChange?: (level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') => void;
  /** 审批策略：ask=需人工审批（默认）、auto=子智能体审批、trust=跳过审批 */
  runMode?: RunMode;
  onRunModeChange?: (mode: RunMode) => void;
  skills?: Array<{ id: string; name: string; description: string | null }>;
  onSelectSkill?: (id: string) => void;
}

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const THINKING_OPTIONS = [
  ['off', '不思考'],
  ['minimal', '极简'],
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
  ['xhigh', '极高'],
] as const;

const ALL_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

/** 模型未声明 effort 档位时的安全默认集（OpenAI reasoning_effort 枚举口径，不含 xhigh） */
const DEFAULT_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high'];

/** 当前模型支持的思考强度档位（依据 reasoningOptions 的 effort 配置；模型配置是唯一权威） */
export function allowedThinkingLevels(model?: ModelOption): ThinkingLevel[] {
  if (!model?.supportsThinking) return ['off'];
  const effort = model.reasoningOptions?.find((o) => o.type === 'effort')?.values;
  if (!effort || effort.length === 0) return DEFAULT_LEVELS;
  return [
    'off',
    ...effort.filter(
      (v): v is ThinkingLevel => v !== 'off' && ALL_LEVELS.includes(v as ThinkingLevel),
    ),
  ];
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function BottomInput({
  activeTab: controlledActiveTab,
  onSend,
  onStop,
  loading = false,
  currentModel,
  models = [],
  onModelChange,
  contextUsage,
  workspaceFiles = [],
  attachments = [],
  uploadingAttachment = false,
  thinkingLevel = 'off',
  onAttach,
  onAttachWorkspaceFile,
  onRemoveAttachment,
  onThinkingLevelChange,
  runMode = 'ask',
  onRunModeChange,
  skills = [],
  onSelectSkill,
}: BottomInputProps): React.ReactElement {
  const [input, setInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const activeTab = controlledActiveTab ?? 'chat';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const supportsImages = currentModel?.supportsImage === true;

  const command = useMemo(() => input.match(/(?:^|\s)([@/])([^\s]*)$/), [input]);
  const commandItems = useMemo(() => {
    if (!command) return [];
    const query = command[2]?.toLowerCase() ?? '';
    if (command[1] === '@') {
      return workspaceFiles
        .filter((file) => file.path.toLowerCase().includes(query))
        .slice(0, 8)
        .map((file) => ({
          id: file.path,
          name: file.path,
          description: '当前会话文件',
          kind: 'file' as const,
        }));
    }
    return skills
      .filter((skill) => skill.name.toLowerCase().includes(query))
      .slice(0, 8)
      .map((skill) => ({ ...skill, kind: 'skill' as const }));
  }, [command, skills, workspaceFiles]);

  const handleFiles = useCallback(
    (files: File[]) => {
      const isImage = (file: File) =>
        file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file.name);
      const accepted = supportsImages ? files : files.filter((file) => !isImage(file));
      if (accepted.length !== files.length)
        message.warning(`当前模型 ${currentModel?.name ?? ''} 不支持图片输入`);
      if (accepted.length > 0) onAttach?.(accepted);
    },
    [currentModel?.name, message, onAttach, supportsImages],
  );

  const selectCommand = useCallback(
    (item: { id: string; name: string; kind: 'file' | 'skill' }) => {
      if (!command) return;
      const triggerIndex = input.lastIndexOf(command[1]!);
      const label = item.kind === 'file' ? `@${item.name}` : `/${item.name}`;
      setInput(`${input.slice(0, triggerIndex)}${label} `);
      if (item.kind === 'file') {
        const file = workspaceFiles.find((entry) => entry.path === item.id);
        if (file) onAttachWorkspaceFile?.(file);
      } else {
        onSelectSkill?.(item.id);
      }
      textareaRef.current?.focus();
    },
    [command, input, onAttachWorkspaceFile, onSelectSkill, workspaceFiles],
  );

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
    // 页签已挪到顶部工具栏；非对话页签下本组件不渲染内容，外层不留内边距
    <div className="shrink-0 px-3 sm:px-6" style={{ background: token.colorBgContainer }}>
      {/* Input Area */}
      {activeTab === 'chat' && (
        <div className="mx-auto max-w-[960px] pb-4">
          <div
            className={`relative flex flex-col gap-3 rounded-[24px] border border-solid px-4 pt-4 pb-3 transition-all sm:px-5 ${dragging ? 'shadow-lg' : ''}`}
            style={{ borderColor: token.colorBorder, background: token.colorBgContainer }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFiles(Array.from(event.dataTransfer.files));
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = token.colorPrimary;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                e.currentTarget.style.borderColor = token.colorBorder;
            }}
          >
            {dragging && (
              <div
                className="pointer-events-none absolute inset-1 z-30 flex items-center justify-center rounded-[20px] border border-dashed text-sm font-medium"
                style={{
                  borderColor: token.colorPrimary,
                  background: token.colorPrimaryBg,
                  color: token.colorPrimary,
                }}
              >
                {supportsImages ? '松开以上传文件或图片' : '松开以上传文件 · 当前模型不支持图片'}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (files.length > 0) {
                  event.preventDefault();
                  handleFiles(files);
                }
              }}
              aria-label="聊天消息"
              placeholder="今天想聊些什么？"
              rows={3}
              className="w-full box-border min-h-[72px] max-h-[120px] resize-none border-none bg-transparent p-0 text-sm leading-6 outline-none font-inherit"
              style={{ color: token.colorText }}
            />
            {command && (
              <div
                className="absolute bottom-[calc(100%-70px)] left-4 right-4 z-20 max-h-64 overflow-auto rounded-xl border border-solid p-1 shadow-lg"
                style={{
                  borderColor: token.colorBorderSecondary,
                  background: token.colorBgElevated,
                }}
              >
                <div className="px-3 py-2 text-xs" style={{ color: token.colorTextSecondary }}>
                  {command[1] === '@' ? '选择当前会话文件' : '选择 Agent 技能'}
                </div>
                {commandItems.length === 0 ? (
                  <div className="px-3 py-3 text-sm" style={{ color: token.colorTextTertiary }}>
                    暂无匹配项
                  </div>
                ) : (
                  commandItems.map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      className="flex w-full cursor-pointer items-start gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-left hover:bg-[var(--ant-color-fill-tertiary)]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCommand(item)}
                    >
                      {item.kind === 'file' ? (
                        <FileOutlined className="mt-1" />
                      ) : (
                        <BulbOutlined className="mt-1" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{item.name}</span>
                        {item.description && (
                          <span
                            className="block truncate text-xs"
                            style={{ color: token.colorTextSecondary }}
                          >
                            {item.description}
                          </span>
                        )}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((file) => (
                  <Tag key={file.path} closable onClose={() => onRemoveAttachment?.(file.path)}>
                    {file.name}
                  </Tag>
                ))}
              </div>
            )}
            <div className="flex items-end justify-between gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={`.md,.mdx,.txt,.log,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.json,.yaml,.yml,.toml,.xml,.html,.htm,.epub${supportsImages ? ',.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff' : ''}`}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) handleFiles(files);
                  event.target.value = '';
                }}
              />
              <Tooltip title={supportsImages ? '添加文件或图片' : '添加文件（当前模型不支持图片）'}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<PlusOutlined />}
                  aria-label="添加附件"
                  loading={uploadingAttachment}
                  onClick={() => fileInputRef.current?.click()}
                />
              </Tooltip>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
                <RunModeSelect value={runMode} onChange={onRunModeChange} disabled={loading} />
                <Popover
                  trigger="click"
                  placement="topRight"
                  content={
                    <div className="w-64 p-1">
                      <div
                        className="px-2 py-1 text-xs"
                        style={{ color: token.colorTextSecondary }}
                      >
                        模型
                      </div>
                      {models.length === 0 ? (
                        <div
                          className="px-2 pb-2 text-sm"
                          style={{ color: token.colorTextTertiary }}
                        >
                          未配置模型
                        </div>
                      ) : (
                        models.map((model) => (
                          <Button
                            key={model.id}
                            type="text"
                            block
                            className="flex justify-between rounded-lg"
                            onClick={() => onModelChange?.(model)}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-left text-sm">{model.name}</span>
                              <span
                                className="block truncate text-left text-xs"
                                style={{ color: token.colorTextTertiary }}
                              >
                                {model.provider}
                              </span>
                            </span>
                            {currentModel?.id === model.id && (
                              <span style={{ color: token.colorPrimary }}>✓</span>
                            )}
                          </Button>
                        ))
                      )}
                      <div
                        className="my-1 border-0 border-t border-solid"
                        style={{ borderColor: token.colorBorderSecondary }}
                      />
                      <div
                        className="px-2 py-1 text-xs"
                        style={{ color: token.colorTextSecondary }}
                      >
                        思考强度
                      </div>
                      {allowedThinkingLevels(currentModel).length <= 1 ? (
                        <div
                          className="px-2 pb-2 text-xs"
                          style={{ color: token.colorTextTertiary }}
                        >
                          当前模型不支持思考
                        </div>
                      ) : (
                        THINKING_OPTIONS.filter(([value]) =>
                          allowedThinkingLevels(currentModel).includes(value),
                        ).map(([value, label]) => (
                          <Button
                            key={value}
                            type="text"
                            block
                            className="flex justify-between rounded-lg"
                            onClick={() => onThinkingLevelChange?.(value)}
                          >
                            <span>{label}</span>
                            {thinkingLevel === value && (
                              <span style={{ color: token.colorPrimary }}>✓</span>
                            )}
                          </Button>
                        ))
                      )}
                    </div>
                  }
                >
                  <Button
                    type="text"
                    aria-label="模型与思考强度"
                    className="max-w-[300px] rounded-full px-3"
                    style={{ background: token.colorFillSecondary }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <RobotOutlined className="shrink-0" />
                      <span className="truncate text-xs">{currentModel?.name ?? '未配置模型'}</span>
                      {thinkingLevel !== 'off' && (
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: token.colorTextSecondary }}
                        >
                          · {THINKING_OPTIONS.find(([value]) => value === thinkingLevel)?.[1]}
                        </span>
                      )}
                      <DownOutlined className="shrink-0 text-[10px]" />
                    </span>
                  </Button>
                </Popover>

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
                    // 键盘提示收进发送按钮 tooltip（原先是发送框下方的一行小字）
                    <Tooltip title="Enter 发送 · Shift + Enter 换行">
                      <span className="inline-flex">
                        <Button
                          type="primary"
                          shape="circle"
                          aria-label="发送消息（Enter 发送，Shift + Enter 换行）"
                          icon={<ArrowUpOutlined />}
                          onClick={handleSend}
                          disabled={!input.trim()}
                        />
                      </span>
                    </Tooltip>
                  )}
                </Space>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
