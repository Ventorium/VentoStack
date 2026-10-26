import { ClockCircleOutlined, FieldTimeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Space, Tag, Tooltip, theme } from 'antd';
import {
  type BackgroundTaskItem,
  TASK_STATUS_META,
  formatDateTime,
  formatNextRun,
  formatSchedule,
  isActiveTask,
} from '../types';

export interface TaskCardProps {
  task: BackgroundTaskItem;
  /** 运行/暂停/取消等操作（由上层统一处理刷新与提示） */
  onAction: (
    action: 'cancel' | 'pause' | 'resume' | 'run' | 'delete',
    task: BackgroundTaskItem,
  ) => void;
  onOpenDetail: (task: BackgroundTaskItem) => void;
}

/** 后台任务卡片（对话内页签与全局页共用） */
export default function TaskCard({
  task,
  onAction,
  onOpenDetail,
}: TaskCardProps): React.ReactElement {
  const { token } = theme.useToken();
  const status = TASK_STATUS_META[task.status];
  const active = isActiveTask(task);
  return (
    <Card
      size="small"
      className="mb-2 rounded-lg"
      styles={{ body: { padding: 12 } }}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0" style={{ color: token.colorTextSecondary }}>
            {task.kind === 'script' ? <ThunderboltOutlined /> : <FieldTimeOutlined />}
          </span>
          <Tooltip title={task.title}>
            <span className="truncate text-[13px]">{task.title}</span>
          </Tooltip>
          <Tag color={status.color} className="m-0 shrink-0">
            {status.label}
          </Tag>
        </span>
      }
      extra={
        <Button type="link" size="small" onClick={() => onOpenDetail(task)}>
          详情
        </Button>
      }
    >
      <div className="flex flex-col gap-1 text-xs" style={{ color: token.colorTextSecondary }}>
        <span className="truncate">规则：{formatSchedule(task)}</span>
        <Space size={12} wrap>
          {task.kind === 'schedule' && (
            <span>
              <ClockCircleOutlined className="mr-1" />
              下次：{formatNextRun(task)}
              {task.nextRunAt ? `（${formatDateTime(task.nextRunAt)}）` : ''}
            </span>
          )}
          <span>
            已触发 {task.runCount}
            {task.kind === 'schedule' ? ` / ${task.maxRuns}` : ''} 次
          </span>
          {task.lastRunAt && <span>最近：{formatDateTime(task.lastRunAt)}</span>}
          {task.kind === 'script' && task.deadlineAt && (
            <span>超时终止：{formatDateTime(task.deadlineAt)}</span>
          )}
          {task.kind === 'schedule' && task.expiresAt && (
            <span>有效期至：{formatDateTime(task.expiresAt)}</span>
          )}
          {task.consecutiveFailures > 0 && (
            <span style={{ color: token.colorWarning }}>
              连续失败 {task.consecutiveFailures} 次
            </span>
          )}
        </Space>
        {task.lastError && (
          <Tooltip title={task.lastError}>
            <span className="truncate" style={{ color: token.colorError }}>
              {task.lastError}
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        {task.status === 'waiting' || task.status === 'pending' ? (
          <Button size="small" onClick={() => onAction('pause', task)}>
            暂停
          </Button>
        ) : null}
        {task.status === 'paused' ? (
          <Button size="small" onClick={() => onAction('resume', task)}>
            恢复
          </Button>
        ) : null}
        {active && (
          <Popconfirm
            title="取消该后台任务？"
            description="脚本进程会被终止，之后不会再次触发。"
            okText="取消任务"
            cancelText="返回"
            onConfirm={() => onAction('cancel', task)}
          >
            <Button size="small" danger>
              取消
            </Button>
          </Popconfirm>
        )}
        {!active && task.status !== 'cancelled' && (
          <Popconfirm
            title="立即重新执行该任务？"
            okText="执行"
            cancelText="返回"
            onConfirm={() => onAction('run', task)}
          >
            <Button size="small">立即执行</Button>
          </Popconfirm>
        )}
        {task.status !== 'running' && (
          <Popconfirm
            title="删除任务？"
            description="任务及其运行记录都会被删除，不可恢复。"
            okText="删除"
            cancelText="返回"
            onConfirm={() => onAction('delete', task)}
          >
            <Button size="small" type="text" danger>
              删除
            </Button>
          </Popconfirm>
        )}
      </div>
    </Card>
  );
}
