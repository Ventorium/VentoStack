import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  LoadingOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Tag, Typography, theme } from 'antd';
import { useState } from 'react';
import type { AgentStep } from '../types';
import StepIcon from './StepIcons';

const { Text } = Typography;

interface AgentStepsProps {
  steps: AgentStep[];
}

/** 工具调用详情：参数与输出摘要（点击工具行展开查看） */
export interface StepDetail {
  /** pretty JSON 参数 */
  arguments?: string;
  /** 后端截断的输出摘要 */
  output?: string;
  /** 非人工放行来源（auto=审批子智能体放行，trust=信任模式跳过审批） */
  approval?: { mode: 'auto' | 'trust'; reason?: string };
  /** 人工审批状态：直接标注在该工具行上（待审批/已允许/已拒绝/已过期） */
  approvalState?: { status: 'pending' | 'approved' | 'rejected' | 'expired'; reason?: string };
}

/** 审批状态在工具行上的展示口径 */
const APPROVAL_STATE_META: Record<
  'pending' | 'approved' | 'rejected' | 'expired',
  { text: string; color: string }
> = {
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '审批已允许', color: 'green' },
  rejected: { text: '审批已拒绝', color: 'red' },
  expired: { text: '审批已过期', color: 'default' },
};

/** 审批结论的展开文案 */
function approvalDetailText(state: NonNullable<StepDetail['approvalState']>): string {
  if (state.status === 'pending') return '等待你在审批弹窗中确认；超时未确认将默认拒绝，工具不会执行。';
  if (state.status === 'approved') return `已允许执行${state.reason ? `：${state.reason}` : ''}`;
  if (state.status === 'rejected') return `已拒绝执行${state.reason ? `：${state.reason}` : ''}`;
  return state.reason ?? '已过期，未执行';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 参数/输出面板：等宽字体 + 高度限制滚动 */
function DetailPanel({ label, text }: { label: string; text: string }) {
  const { token } = theme.useToken();
  return (
    <div className="mt-1 mb-1">
      <Text type="secondary" className="text-[11px]">
        {label}
      </Text>
      <pre
        className="text-xs whitespace-pre-wrap wrap-break-word max-h-52 overflow-auto p-2 m-0 leading-5"
        style={{ background: token.colorFillQuaternary, borderRadius: token.borderRadiusSM }}
      >
        {text}
      </pre>
    </div>
  );
}

/** 单个步骤行：AgentSteps 列表与 blocks 交错渲染共用；携带 detail 时可点击展开参数/输出 */
export function StepRow({ step, detail }: { step: AgentStep; detail?: StepDetail }) {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!(detail?.arguments || detail?.output || detail?.approval || detail?.approvalState);

  return (
    <div>
      <div
        className={`flex items-center gap-2 text-xs ${hasDetail ? 'cursor-pointer' : ''}`}
        style={{
          padding: '4px 8px',
          borderRadius: token.borderRadiusSM,
          color: token.colorTextSecondary,
        }}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        {step.status === 'completed' ? (
          <CheckCircleOutlined
            className="text-[13px] shrink-0"
            style={{ color: token.colorSuccess }}
          />
        ) : step.status === 'error' ? (
          <CloseCircleOutlined
            className="text-[13px] shrink-0"
            style={{ color: token.colorError }}
          />
        ) : (
          <LoadingOutlined className="text-[13px] shrink-0" style={{ color: token.colorPrimary }} />
        )}
        <StepIcon type={step.type} />
        <Text
          strong={step.type === 'skill'}
          className="text-xs whitespace-nowrap"
          style={{ color: step.type === 'skill' ? token.colorPrimary : token.colorText }}
        >
          {step.name}
        </Text>
        <Text type="secondary" ellipsis className="flex-1 text-xs">
          {step.description}
        </Text>
        {detail?.approvalState && (
          <Tag
            className="text-[11px] m-0 leading-[18px]"
            color={APPROVAL_STATE_META[detail.approvalState.status].color}
          >
            {APPROVAL_STATE_META[detail.approvalState.status].text}
          </Tag>
        )}
        {detail?.approval && (
          <Tag
            className="text-[11px] m-0 leading-[18px]"
            color={detail.approval.mode === 'trust' ? 'red' : 'orange'}
          >
            {detail.approval.mode === 'trust' ? '信任放行' : '自动放行'}
          </Tag>
        )}
        {step.durationMs !== undefined && (
          <Tag className="text-[11px] m-0 leading-[18px]">{formatDuration(step.durationMs)}</Tag>
        )}
        {hasDetail && <CodeOutlined className="text-[11px] shrink-0 opacity-60" />}
        {hasDetail && (
          <RightOutlined
            className="text-[10px] shrink-0 opacity-60"
            style={{
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        )}
      </div>
      {expanded && hasDetail && (
        <div className="pl-6">
          {detail?.approvalState && (
            <DetailPanel label="审批" text={approvalDetailText(detail.approvalState)} />
          )}
          {detail?.approval && (
            <DetailPanel
              label="审批"
              text={
                detail.approval.mode === 'trust'
                  ? '信任模式：跳过审批直接执行'
                  : `自动审批放行：${detail.approval.reason ?? '（未给出理由）'}`
              }
            />
          )}
          {detail?.arguments && <DetailPanel label="参数" text={detail.arguments} />}
          {detail?.output && <DetailPanel label="输出" text={detail.output} />}
        </div>
      )}
    </div>
  );
}

export default function AgentSteps({ steps }: AgentStepsProps) {
  const [expanded, setExpanded] = useState(true);
  const { token } = theme.useToken();

  if (!steps.length) return null;

  return (
    <div className="mb-3">
      {/* Toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 cursor-pointer text-xs select-none"
        style={{
          padding: '3px 10px',
          borderRadius: token.borderRadiusSM,
          background: token.colorFillQuaternary,
          border: `1px solid ${token.colorBorderSecondary}`,
          marginBottom: expanded ? 8 : 0,
          color: token.colorTextSecondary,
        }}
      >
        <RightOutlined
          className="text-[10px]"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
        {steps.length} 步执行完成
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 py-[4px]">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}
