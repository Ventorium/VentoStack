import MarkdownPreview from '@/components/MarkdownPreview';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DislikeOutlined,
  DownOutlined,
  EditOutlined,
  FileTextOutlined,
  LikeOutlined,
  LinkOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Input, Space, Tooltip, Typography, message as msg, theme } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatApproval, ChatMessage } from '../types';
import AgentSteps, { StepRow } from './AgentSteps';
import { ResearchSources, ResearchStatus } from './ResearchStatus';

const { Text, Paragraph } = Typography;

interface ChatAreaProps {
  messages: ChatMessage[];
  agentName?: string;
  welcomeMessage?: string | null;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
  /** 聊天内嵌审批决定：返回是否提交成功（成功后由后端唤醒流继续执行） */
  onApprovalDecision?: (approvalId: string, decision: 'approved' | 'rejected') => Promise<boolean>;
  /** 点击引用：URL 引用新标签页打开，文件引用切换到文件页签预览 */
  onCiteClick?: (name: string, url?: string) => void;
  /** 编辑用户消息并重新发送：仅会话结束（含失败）时由父组件传入 */
  onEditResend?: (messageId: string, newContent: string) => void;
}

/** 从引用行解析名称与可选 URL：支持 `- 来源: [标题](url)`、`- 来源: https://...` 与纯文本 */
/** 模型推理/思考内容：灰色可折叠块，流式期间自动展开 */
function ThinkingBlock({ thinking, streaming }: { thinking: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(streaming ?? false);
  return (
    <div className="mb-2 rounded-md px-3 py-2 bg-black/[0.03] dark:bg-white/[0.04]">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs select-none text-neutral-500 dark:text-neutral-400"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <DownOutlined /> : <RightOutlined />}
        深度思考
        {streaming && <span className="animate-pulse">·</span>}
      </button>
      {expanded && (
        <div className="mt-1.5 text-[12px] leading-5 whitespace-pre-wrap text-neutral-500 dark:text-neutral-400">
          {thinking}
        </div>
      )}
    </div>
  );
}

function parseCitationLine(raw: string): { name: string; url?: string } | null {
  const line = raw.replace(/^\s*[-*]\s*(来源\s*[:：])?\s*/, '').trim();
  if (!line) return null;
  const md = line.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)$/);
  if (md) return { name: md[1]!, url: md[2] };
  const bare = line.match(/^(https?:\/\/\S+?)\.*$/);
  if (bare) return { name: bare[1]!, url: bare[1] };
  return { name: line.replace(/^\[|\]$/g, '').trim() };
}

/** 从 assistant 内容末尾解析「### 引用来源」区块 */
function splitCitations(content: string): {
  displayContent: string;
  citations: Array<{ name: string; url?: string }>;
} {
  const match = content.match(/###\s*引用来源\s*\n([\s\S]*)$/);
  if (!match || match.index === undefined) return { displayContent: content, citations: [] };
  const citations = match[1]
    .split('\n')
    .map(parseCitationLine)
    .filter((c): c is { name: string; url?: string } => !!c?.name);
  if (citations.length === 0) return { displayContent: content, citations: [] };
  return { displayContent: content.slice(0, match.index).trimEnd(), citations };
}

/** 引用列表：展示在消息底部，URL 引用点击新标签页打开，文件引用跳转文件预览 */
function CitationsBlock({
  citations,
  onCiteClick,
}: {
  citations: Array<{ name: string; url?: string }>;
  onCiteClick?: (name: string, url?: string) => void;
}) {
  const { token } = theme.useToken();
  return (
    <div className="mt-2 pt-2" style={{ borderTop: `1px dashed ${token.colorBorderSecondary}` }}>
      <Text type="secondary" className="text-xs block mb-1">
        引用来源（{citations.length}）
      </Text>
      <Space size={[4, 4]} wrap>
        {citations.map((c, i) => (
          <Button
            key={`${c.name}-${i}`}
            size="small"
            type="text"
            icon={c.url ? <LinkOutlined /> : <FileTextOutlined />}
            className="text-xs"
            style={{ color: token.colorPrimary }}
            onClick={() => onCiteClick?.(c.name, c.url)}
          >
            <span className="inline-block align-bottom truncate" style={{ maxWidth: 240 }}>
              {c.name}
            </span>
          </Button>
        ))}
      </Space>
    </div>
  );
}

/** 工具审批卡片：高风险工具需要用户在聊天内确认后才能继续执行 */
function ApprovalCard({
  approval,
  onDecision,
}: {
  approval: ChatApproval;
  onDecision?: (approvalId: string, decision: 'approved' | 'rejected') => Promise<boolean>;
}) {
  const { token } = theme.useToken();
  const expired = approval.status === 'pending' && Date.now() > Date.parse(approval.expiresAt);
  const effectiveStatus = expired ? ('expired' as const) : approval.status;

  const statusText =
    effectiveStatus === 'pending'
      ? '需要你的确认后才能继续执行'
      : effectiveStatus === 'approved'
        ? '已允许'
        : effectiveStatus === 'rejected'
          ? '已拒绝'
          : '已过期';

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    const ok = await onDecision?.(approval.id, decision);
    if (ok) {
      msg.success(decision === 'approved' ? '已允许执行' : '已拒绝执行');
    }
  };

  return (
    <div
      className="mb-2 p-3 rounded-md"
      style={{ background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}` }}
    >
      <Space size={6} className="mb-1">
        <SafetyCertificateOutlined style={{ color: token.colorWarning }} />
        <Text strong className="text-[13px]">
          工具执行审批：{approval.toolName}
        </Text>
        <Text type="secondary" className="text-xs">
          {statusText}
        </Text>
      </Space>
      <Paragraph
        code
        className="text-xs mb-2!"
        ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
      >
        {JSON.stringify(approval.input ?? {})}
      </Paragraph>
      {effectiveStatus === 'pending' && (
        <Space size={8}>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleDecision('approved')}
          >
            允许
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleDecision('rejected')}
          >
            拒绝
          </Button>
        </Space>
      )}
    </div>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function MessageActions({
  content,
  messageId,
  onCopy,
  onRegenerate,
}: {
  content: string;
  messageId: string;
  onCopy?: (content: string) => void;
  onRegenerate?: (messageId: string) => void;
}) {
  return (
    <Space size={0}>
      <Tooltip title="复制">
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          className="opacity-40 color-inherit transition-opacity group-hover:opacity-100"
          onClick={() => {
            if (onCopy) {
              onCopy(content);
            } else {
              navigator.clipboard.writeText(content).then(() => msg.success('已复制'));
            }
          }}
        />
      </Tooltip>
      <Tooltip title="重新生成">
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          className="opacity-40 color-inherit transition-opacity group-hover:opacity-100"
          onClick={() => onRegenerate?.(messageId)}
        />
      </Tooltip>
      <Tooltip title="有用">
        <Button
          type="text"
          size="small"
          icon={<LikeOutlined />}
          className="opacity-40 color-inherit transition-opacity group-hover:opacity-100"
          onClick={() => msg.success('感谢反馈')}
        />
      </Tooltip>
      <Tooltip title="无用">
        <Button
          type="text"
          size="small"
          icon={<DislikeOutlined />}
          className="opacity-40 color-inherit transition-opacity group-hover:opacity-100"
          onClick={() => msg.success('感谢反馈')}
        />
      </Tooltip>
    </Space>
  );
}

export default function ChatArea({
  messages,
  agentName = '新助手',
  welcomeMessage,
  onCopy,
  onRegenerate,
  onApprovalDecision,
  onCiteClick,
  onEditResend,
}: ChatAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();
  // 用户消息编辑态：记录正在编辑的消息 id 与草稿内容
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  // 是否停留在底部：停留时跟随流式输出，用户上翻后停止跟随以免被拽回底部
  const [stickToBottom, setStickToBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  /** 是否贴近底部：读真实 DOM 位置，避免依赖可能已过期的 state */
  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  }, []);

  // 按钮显隐：滚动时刷新。依赖 hasMessages——空态不渲染滚动容器（ref 为 null），
  // 必须在容器挂载后重新绑定监听
  const hasMessages = messages.length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasMessages 是"容器已挂载"的重绑定触发条件，非effect内部引用
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => setStickToBottom(isNearBottom());
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMessages, isNearBottom]);

  // 首条消息 id 变化即视为切换会话（会话内流式追加不会改变首条消息）
  const firstMessageIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const firstId = messages[0]?.id;
    const conversationSwitched = firstId !== firstMessageIdRef.current;
    firstMessageIdRef.current = firstId;
    // 切换会话 / 用户新发消息：回到底部；流式追加：仅在用户仍停留底部时跟随
    if (conversationSwitched || messages.at(-1)?.role === 'user' || isNearBottom()) {
      // 显式恢复"贴底"意图：长会话在挂载瞬间就可能被滚动监听判定为"已上翻"，
      // 内容布局完成后由 ResizeObserver 接手滚到底
      setStickToBottom(true);
      scrollToBottom('auto');
    }
  }, [messages, isNearBottom, scrollToBottom]);

  // 内容高度变化时保持贴底：markdown / 代码块等是在 messages 更新之后才完成布局的，
  // 只按 messages 变化滚一次会扑空（彼时 scrollHeight 尚未增长）
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    stickToBottomRef.current = stickToBottom;
  }, [stickToBottom]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasMessages 是"容器已挂载"的重绑定触发条件，非effect内部引用
  useEffect(() => {
    const el = containerRef.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) scrollToBottom('auto');
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasMessages, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Avatar
          size={64}
          className="text-[28px] font-bold"
          style={{ background: token.colorPrimary, borderRadius: token.borderRadiusLG }}
        >
          {agentName.slice(0, 1)}
        </Avatar>
        <Text strong className="text-xl">
          {agentName}
        </Text>
        <Text type="secondary" className="text-sm max-w-[400px] text-center">
          {welcomeMessage?.trim() || '有什么可以帮助你的？'}
        </Text>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-w-0 min-h-0 flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto py-[16px]">
        <div className="max-w-[820px]" style={{ margin: '0 auto', padding: '0 16px' }}>
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className="group flex gap-3 mb-5"
                style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
              >
                {/* Avatar */}
                {isUser ? (
                  <Avatar
                    size={32}
                    icon={<UserOutlined />}
                    className="shrink-0"
                    style={{ background: token.colorPrimaryBg, color: token.colorPrimary }}
                  />
                ) : (
                  <Avatar
                    size={32}
                    className="text-xs font-semibold shrink-0"
                    style={{ background: token.colorPrimary }}
                  >
                    {agentName.slice(0, 2)}
                  </Avatar>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0" style={{ maxWidth: isUser ? '70%' : '100%' }}>
                  <Text
                    type="secondary"
                    className="text-xs block mb-1"
                    style={{ textAlign: isUser ? 'right' : 'left' }}
                  >
                    {isUser ? '你' : agentName}
                  </Text>

                  {isUser && editing?.id === msg.id ? (
                    <div>
                      <Input.TextArea
                        value={editing.value}
                        onChange={(e) => setEditing({ id: msg.id, value: e.target.value })}
                        autoSize={{ minRows: 2, maxRows: 10 }}
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <Button size="small" onClick={() => setEditing(null)}>
                          取消
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          disabled={!editing.value.trim()}
                          onClick={() => {
                            const value = editing.value.trim();
                            setEditing(null);
                            onEditResend?.(msg.id, value);
                          }}
                        >
                          保存并重发
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: token.borderRadiusLG,
                        background: isUser ? token.colorFillSecondary : token.colorFillQuaternary,
                        border: isUser ? 'none' : `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      {!isUser && msg.approval && (
                        <ApprovalCard approval={msg.approval} onDecision={onApprovalDecision} />
                      )}

                      {!isUser && msg.researchStages && msg.researchStages.length > 0 && (
                        <ResearchStatus stages={msg.researchStages} streaming={msg.isStreaming} />
                      )}

                      {!isUser && msg.thinking && (
                        <ThinkingBlock thinking={msg.thinking} streaming={msg.isStreaming} />
                      )}

                      {!isUser && msg.blocks && msg.blocks.length > 0 ? (
                        // 按流式到达顺序交错渲染：文本段与工具块的位置与生成顺序一致
                        msg.blocks.map((block, i) => {
                          if (block.type === 'text') {
                            const { displayContent, citations } = msg.isStreaming
                              ? { displayContent: block.text, citations: [] }
                              : splitCitations(block.text);
                            return (
                              <div key={`b-${i}`}>
                                <MarkdownPreview
                                  content={displayContent}
                                  className="text-[13px]"
                                  breaks
                                  streaming={msg.isStreaming && i === msg.blocks.length - 1}
                                />
                                {!msg.isStreaming && citations.length > 0 && (
                                  <CitationsBlock citations={citations} onCiteClick={onCiteClick} />
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={`b-${i}`} className="my-1">
                              <StepRow
                                step={{
                                  id: block.id,
                                  type: 'tool',
                                  name: block.name,
                                  description:
                                    block.status === 'error' ? '执行失败' : '执行工具调用',
                                  durationMs: block.durationMs,
                                  status: block.status,
                                }}
                                detail={{
                                  ...(block.arguments === undefined
                                    ? {}
                                    : { arguments: block.arguments }),
                                  ...(block.output === undefined ? {} : { output: block.output }),
                                }}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <>
                          {!isUser && msg.steps && msg.steps.length > 0 && (
                            <AgentSteps steps={msg.steps} />
                          )}

                          {(() => {
                            const { displayContent, citations } =
                              !isUser && !msg.isStreaming
                                ? splitCitations(msg.content)
                                : { displayContent: msg.content, citations: [] };
                            return (
                              <>
                                <MarkdownPreview
                                  content={displayContent}
                                  className="text-[13px]"
                                  breaks
                                  streaming={msg.isStreaming}
                                />
                                {!isUser && citations.length > 0 && (
                                  <CitationsBlock citations={citations} onCiteClick={onCiteClick} />
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}

                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <ResearchSources sources={msg.sources} />
                      )}

                      {msg.isStreaming && (
                        <Space size={4} className="mt-2">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 opacity-60"
                              style={{
                                borderRadius: '50%',
                                background: token.colorPrimary,
                                animation: `chat-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                              }}
                            />
                          ))}
                        </Space>
                      )}
                    </div>
                  )}

                  {/* 用户消息操作：hover 显示编辑与复制 */}
                  {isUser && editing?.id !== msg.id && (
                    <div className="flex gap-1 justify-end mt-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {onEditResend && (
                        <Tooltip title="编辑并重新发送">
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            className="opacity-50 color-inherit"
                            onClick={() => setEditing({ id: msg.id, value: msg.content })}
                          />
                        </Tooltip>
                      )}
                      <Tooltip title="复制">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          className="opacity-50 color-inherit"
                          onClick={() => {
                            if (onCopy) onCopy(msg.content);
                            else navigator.clipboard.writeText(msg.content);
                          }}
                        />
                      </Tooltip>
                    </div>
                  )}

                  {!isUser && !msg.isStreaming && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <MessageActions
                        content={msg.content}
                        messageId={msg.id}
                        onCopy={onCopy}
                        onRegenerate={onRegenerate}
                      />
                      {(msg.model || msg.tokensUsed) && (
                        <>
                          <span
                            className="w-px h-3 mx-0.5 shrink-0"
                            style={{ background: token.colorBorderSecondary }}
                          />
                          {msg.model && (
                            <span
                              className="text-[11px] px-1.5 py-px rounded-full shrink-0"
                              style={{
                                color: token.colorTextTertiary,
                                background: token.colorFillQuaternary,
                              }}
                            >
                              <RobotOutlined className="mr-1 opacity-70" />
                              {msg.model}
                            </span>
                          )}
                          {msg.tokensUsed && (
                            <Text type="secondary" className="text-[11px] whitespace-nowrap">
                              {formatTokenCount(msg.tokensUsed.input)} /{' '}
                              {formatTokenCount(msg.tokensUsed.output)} tokens
                            </Text>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <style>{`
        @keyframes chat-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      </div>

      {!stickToBottom && (
        <Button
          shape="circle"
          aria-label="滚动到最底部"
          icon={<DownOutlined />}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-lg"
          onClick={() => scrollToBottom('smooth')}
        />
      )}
    </div>
  );
}
