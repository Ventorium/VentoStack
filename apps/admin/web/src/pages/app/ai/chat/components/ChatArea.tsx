import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DislikeOutlined,
  LikeOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Space, Tooltip, Typography, message as msg, theme } from 'antd';
import { useCallback, useEffect, useRef } from 'react';
import type { ChatApproval, ChatMessage } from '../types';
import AgentSteps from './AgentSteps';
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

/** 行内渲染：加粗 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/** 简易 Markdown 风格渲染 */
function renderContent(
  content: string,
  token: ReturnType<typeof theme.useToken>['token'],
): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\|[\s\-:|]+\|$/.test(line)) continue;

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!inTable) {
        inTable = true;
        elements.push(
          <div
            key={`tbl-h-${i}`}
            className="grid pb-1 mb-0.5"
            style={{
              gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {cells.map((c, ci) => (
              <Text key={ci} strong className="text-xs py-[2px] px-[8px]">
                {renderInline(c)}
              </Text>
            ))}
          </div>,
        );
      } else {
        elements.push(
          <div
            key={`tbl-r-${i}`}
            className="grid mb-0.5"
            style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
          >
            {cells.map((c, ci) => (
              <Text key={ci} className="text-[13px] py-[2px] px-[8px]">
                {renderInline(c)}
              </Text>
            ))}
          </div>,
        );
      }
      continue;
    }
    inTable = false;

    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    if (line.startsWith('• ') || line.startsWith('- ')) {
      elements.push(
        <div key={`li-${i}`} className="flex gap-2 pl-1 mb-0.5">
          <span className="shrink-0" style={{ color: token.colorPrimary }}>
            •
          </span>
          <Text className="text-[13px]">{renderInline(line.replace(/^[•\-]\s*/, ''))}</Text>
        </div>,
      );
      continue;
    }

    elements.push(
      <Text key={`p-${i}`} className="text-[13px] block mb-0.5 leading-[22px]">
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
                  {!isUser && msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} />}

                  {!isUser && msg.approval && (
                    <ApprovalCard approval={msg.approval} onDecision={onApprovalDecision} />
                  )}

                  {!isUser && msg.researchStages && msg.researchStages.length > 0 && (
                    <ResearchStatus stages={msg.researchStages} streaming={msg.isStreaming} />
                  )}

                  <div>{renderContent(msg.content, token)}</div>

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
