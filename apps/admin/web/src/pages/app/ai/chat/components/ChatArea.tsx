import MarkdownPreview from '@/components/MarkdownPreview';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DislikeOutlined,
  FileTextOutlined,
  LikeOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Space, Tooltip, Typography, message as msg, theme } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
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
  /** 点击引用文件：切换到文件页签并预览该文件 */
  onCiteClick?: (name: string) => void;
}

/** 从 assistant 内容末尾解析「### 引用来源」区块 */
function splitCitations(content: string): { displayContent: string; citations: string[] } {
  const match = content.match(/###\s*引用来源\s*\n([\s\S]*)$/);
  if (!match || match.index === undefined) return { displayContent: content, citations: [] };
  const citations = match[1]
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*]\s*(来源\s*[:：])?\s*/, '')
        .replace(/^\[(.*?)\]\(.*?\)$/, '$1')
        .replace(/^\[|\]$/g, '')
        .trim(),
    )
    .filter(Boolean);
  if (citations.length === 0) return { displayContent: content, citations: [] };
  return { displayContent: content.slice(0, match.index).trimEnd(), citations };
}

/** 引用文件列表：展示在消息底部，点击可跳转文件预览 */
function CitationsBlock({
  citations,
  onCiteClick,
}: {
  citations: string[];
  onCiteClick?: (name: string) => void;
}) {
  const { token } = theme.useToken();
  return (
    <div
      className="mt-2 pt-2"
      style={{ borderTop: `1px dashed ${token.colorBorderSecondary}` }}
    >
      <Text type="secondary" className="text-xs block mb-1">
        引用来源（{citations.length}）
      </Text>
      <Space size={[4, 4]} wrap>
        {citations.map((name, i) => (
          <Button
            key={`${name}-${i}`}
            size="small"
            type="text"
            icon={<FileTextOutlined />}
            className="text-xs"
            style={{ color: token.colorPrimary }}
            onClick={() => onCiteClick?.(name)}
          >
            {name}
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
    <Space size={2} className="mt-2">
      <Tooltip title="复制">
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          className="opacity-50 color-inherit"
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
          className="opacity-50 color-inherit"
          onClick={() => onRegenerate?.(messageId)}
        />
      </Tooltip>
      <Tooltip title="有用">
        <Button
          type="text"
          size="small"
          icon={<LikeOutlined />}
          className="opacity-50 color-inherit"
          onClick={() => msg.success('感谢反馈')}
        />
      </Tooltip>
      <Tooltip title="无用">
        <Button
          type="text"
          size="small"
          icon={<DislikeOutlined />}
          className="opacity-50 color-inherit"
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
}: ChatAreaProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  const latestMessage = messages.at(-1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: message updates intentionally trigger scrolling
  useEffect(() => {
    scrollToBottom();
  }, [latestMessage, scrollToBottom]);

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
    <div className="flex-1 overflow-auto py-[16px]">
      <div className="max-w-[820px]" style={{ margin: '0 auto', padding: '0 16px' }}>
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className="flex gap-3 mb-5"
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
                              description: block.status === 'error' ? '执行失败' : '执行工具调用',
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

                {!isUser && !msg.isStreaming && (
                  <>
                    <MessageActions
                      content={msg.content}
                      messageId={msg.id}
                      onCopy={onCopy}
                      onRegenerate={onRegenerate}
                    />
                    {(msg.model || msg.tokensUsed) && (
                      <Space size={8} className="mt-1.5">
                        {msg.model && (
                          <Text type="secondary" className="text-[11px]">
                            <RobotOutlined className="mr-1" />
                            {msg.model}
                          </Text>
                        )}
                        {msg.tokensUsed && (
                          <Text type="secondary" className="text-[11px]">
                            {formatTokenCount(msg.tokensUsed.input)} /{' '}
                            {formatTokenCount(msg.tokensUsed.output)} tokens
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
