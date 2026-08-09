import { CheckOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { Fragment } from 'react';
import type { ResearchSource, ResearchStage } from '../types';

const STAGE_META: Record<ResearchStage, { label: string; color: string }> = {
  planning: { label: '规划', color: 'blue' },
  researching: { label: '并行研究', color: 'gold' },
  synthesizing: { label: '综合报告', color: 'purple' },
};

const STAGE_ORDER: ResearchStage[] = ['planning', 'researching', 'synthesizing'];

/** 深度研究阶段进度条（规划 → 并行研究 → 综合报告） */
export function ResearchStatus({
  stages,
  streaming,
}: {
  stages: ResearchStage[];
  streaming?: boolean;
}) {
  if (stages.length === 0) return null;
  const currentIndex = stages.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
      {STAGE_ORDER.map((stage, i) => {
        const reached = stages.includes(stage);
        const isCurrent = streaming && i === currentIndex && reached;
        const meta = STAGE_META[stage];
        return (
          <Fragment key={stage}>
            <Tag
              color={reached ? meta.color : 'default'}
              icon={reached && !isCurrent ? <CheckOutlined /> : undefined}
              className="!m-0"
              style={{ opacity: reached ? 1 : 0.45 }}
            >
              {meta.label}
              {isCurrent ? '…' : ''}
            </Tag>
            {i < STAGE_ORDER.length - 1 && <span className="text-xs opacity-30">→</span>}
          </Fragment>
        );
      })}
    </div>
  );
}

/** 引用来源清单卡片 */
export function ResearchSources({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 pt-2">
      <div className="text-xs font-medium mb-1 opacity-70">引用来源（{sources.length}）</div>
      <div className="flex flex-col gap-0.5">
        {sources.map((source, i) => (
          <a
            key={`${source.url}-${i}`}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs flex items-center gap-1 max-w-full truncate hover:underline"
          >
            <span className="opacity-50 shrink-0">[{i + 1}]</span>
            <span className="truncate">{source.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
