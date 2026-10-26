/**
 * 对话页「后台任务」页签
 *
 * 展示当前会话关联的脚本任务 / 定时唤醒任务；会话可以结束，任务在服务端继续跑，
 * 定时任务到点后会恢复本会话并追加一条消息（对话页轮询到变化会自动回显）。
 */
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Spin, Tag, theme } from 'antd';
import { useState } from 'react';
import TaskCard from '../../tasks/components/task-card';
import TaskDetailDrawer from '../../tasks/components/task-detail-drawer';
import { type TaskAction, useTaskActions } from '../../tasks/hooks';
import { type BackgroundTaskItem, isActiveTask } from '../../tasks/types';

export interface BackgroundTasksPanelProps {
  sessionId?: string;
  tasks: BackgroundTaskItem[];
  loading: boolean;
  /** 当前会话是否有一轮对话正在运行（含后台唤醒） */
  running: boolean;
  onRefresh: () => Promise<void>;
}

export default function BackgroundTasksPanel({
  sessionId,
  tasks,
  loading,
  running,
  onRefresh,
}: BackgroundTasksPanelProps): React.ReactElement {
  const { token } = theme.useToken();
  const { act } = useTaskActions(onRefresh);
  const [detail, setDetail] = useState<BackgroundTaskItem | null>(null);
  const activeCount = tasks.filter(isActiveTask).length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;

  const handleAction = (action: TaskAction, task: BackgroundTaskItem): void => {
    void act(action, task);
    if (detail?.id === task.id) setDetail(null);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[960px] flex-col px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">后台任务</span>
          <Tag color="blue" className="m-0">
            {activeCount} 个进行中
          </Tag>
          {failedCount > 0 && (
            <Tag color="red" className="m-0">
              {failedCount} 个失败
            </Tag>
          )}
          {running && (
            <Tag color="processing" className="m-0">
              会话运行中
            </Tag>
          )}
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void onRefresh()}
        >
          刷新
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-2"
        message="后台任务在服务端独立运行，你可以关闭或离开本页面"
        description="脚本任务完成后、定时任务到点后，系统会在本会话追加一条消息自动唤醒 Agent 继续执行；运行记录与日志可点任务「详情」查看。"
      />

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!sessionId ? (
          <Empty description="先开始一段对话，才能创建后台任务" className="py-10" />
        ) : loading && tasks.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : tasks.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: token.colorTextSecondary }}>
                暂无后台任务。可以在对话里让 Agent「后台下载一个大文件」或「每 10
                分钟检查一次价格」。
              </span>
            }
            className="py-10"
          >
            <span
              className="flex items-center justify-center gap-1 text-xs"
              style={{ color: token.colorTextTertiary }}
            >
              <ThunderboltOutlined />
              任务由 Agent 通过后台任务工具创建（创建时需人工审批）
            </span>
          </Empty>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onAction={handleAction} onOpenDetail={setDetail} />
          ))
        )}
      </div>

      <TaskDetailDrawer task={detail} open={detail !== null} onClose={() => setDetail(null)} />
    </div>
  );
}
