import { ClockCircleOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { Tag, theme } from 'antd';
import type { BackgroundTaskEvent } from '../../chat/types';

const EVENT_META: Record<string, { label: string; color: string }> = {
  started: { label: '已启动', color: 'blue' },
  completed: { label: '已完成', color: 'green' },
  failed: { label: '失败', color: 'red' },
  triggered: { label: '已唤醒会话', color: 'processing' },
  interrupted: { label: '已中断', color: 'orange' },
  auto_paused: { label: '连续失败已自动暂停', color: 'orange' },
  expired: { label: '已到期', color: 'default' },
  run_failed: { label: '执行失败', color: 'red' },
};

/** 会话时间线里的后台任务事件（对齐 DSH 的 job/registered、job/settled 写回会话） */
export default function TaskEventLine({
  event,
  onClick,
}: {
  event: BackgroundTaskEvent;
  onClick?: (taskId: string) => void;
}): React.ReactElement {
  const { token } = theme.useToken();
  const meta = EVENT_META[event.event] ?? { label: event.event, color: 'default' };
  const detail =
    event.event === 'auto_paused'
      ? event.reason
      : event.event === 'interrupted'
        ? event.reason
        : event.summary;
  return (
    <div className="mb-3 flex justify-center">
      <button
        type="button"
        className="flex max-w-full items-center gap-1.5 rounded-full border-0 px-3 py-1 text-[11px] transition-opacity hover:opacity-80"
        style={{ background: token.colorFillQuaternary, color: token.colorTextSecondary }}
        onClick={() => event.taskId && onClick?.(event.taskId)}
        title="查看后台任务详情"
      >
        <FieldTimeOutlined />
        <span className="max-w-[220px] truncate">后台任务「{event.title ?? event.taskId}」</span>
        <Tag color={meta.color} className="m-0 px-1 py-0 text-[10px] leading-4">
          {meta.label}
        </Tag>
        {detail && <span className="max-w-[260px] truncate opacity-70">{detail}</span>}
        {event.at && (
          <span className="flex shrink-0 items-center gap-0.5 opacity-60">
            <ClockCircleOutlined />
            {new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </button>
    </div>
  );
}
