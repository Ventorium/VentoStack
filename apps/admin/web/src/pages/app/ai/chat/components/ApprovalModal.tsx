import { CheckOutlined, CloseOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Modal, Space, Tag, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import type { ChatApproval } from '../types';

const { Text } = Typography;

const RISK_META: Record<string, { label: string; color: string }> = {
  low: { label: '低风险', color: 'green' },
  medium: { label: '中风险', color: 'blue' },
  high: { label: '高风险', color: 'orange' },
  critical: { label: '极高风险', color: 'red' },
};

/** 剩余有效期：后端审批单带 expiresAt，超时后不可再确认 */
function formatRemaining(expiresAt: string, now: number): string {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0) return '已过期';
  const seconds = Math.ceil(left / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

/**
 * 工具执行审批弹窗：高风险工具挂起时弹出，等待用户确认后才继续执行。
 * 注意批准语义——批准后，**同一工具、同一参数**在有效期内会被自动放行（后端 findRecentApproved），
 * 文案里必须说清楚，避免用户误以为只放行这一次。
 */
export default function ApprovalModal({
  approval,
  onDecision,
}: {
  approval?: ChatApproval;
  onDecision?: (approvalId: string, decision: 'approved' | 'rejected') => Promise<boolean>;
}) {
  const { token } = theme.useToken();
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const open = approval?.status === 'pending';

  // 倒计时：仅在弹窗打开时每秒刷新
  // biome-ignore lint/correctness/useExhaustiveDependencies: approval.id 是"换了审批单就重新起算"的触发条件，非effect内部引用
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, approval?.id]);

  if (!approval) return null;
  const risk = RISK_META[approval.riskLevel ?? 'low'] ?? RISK_META.low!;
  const expired = Date.parse(approval.expiresAt) <= now;

  const decide = async (decision: 'approved' | 'rejected') => {
    setSubmitting(true);
    try {
      await onDecision?.(approval.id, decision);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!open}
      title={
        <Space size={8}>
          <SafetyCertificateOutlined style={{ color: token.colorWarning }} />
          <span>工具执行审批</span>
        </Space>
      }
      width={520}
      maskClosable={false}
      keyboard={false}
      closable={false}
      destroyOnHidden
      footer={
        <Space size={8}>
          <Button
            danger
            icon={<CloseOutlined />}
            loading={submitting}
            disabled={expired}
            onClick={() => void decide('rejected')}
          >
            拒绝
          </Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={submitting}
            disabled={expired}
            onClick={() => void decide('approved')}
          >
            允许执行
          </Button>
        </Space>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Text type="secondary" className="text-xs">
            模型请求执行以下工具
          </Text>
          <div className="mt-1 flex items-center gap-2">
            <Text strong className="text-[15px]">
              {approval.toolName}
            </Text>
            <Tag color={risk.color} className="m-0">
              {risk.label}
            </Tag>
          </div>
        </div>

        <div>
          <Text type="secondary" className="text-xs">
            调用参数
          </Text>
          <pre
            className="mt-1 mb-0 max-h-[220px] overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap break-all"
            style={{
              background: token.colorFillQuaternary,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            {JSON.stringify(approval.input ?? {}, null, 2)}
          </pre>
        </div>

        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            background: expired ? token.colorErrorBg : token.colorWarningBg,
            border: `1px solid ${expired ? token.colorErrorBorder : token.colorWarningBorder}`,
            color: token.colorTextSecondary,
          }}
        >
          {expired
            ? '本次审批已过期，该工具调用不会执行。'
            : `允许后，同一工具、同一参数在有效期内将自动放行（剩余 ${formatRemaining(approval.expiresAt, now)}）。`}
        </div>
      </div>
    </Modal>
  );
}
