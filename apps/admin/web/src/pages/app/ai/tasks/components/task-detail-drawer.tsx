import { Drawer, Empty, List, Spin, Tag, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import { fetchTaskLog, fetchTaskRuns } from '../api';
import {
  type BackgroundTaskItem,
  type BackgroundTaskRunItem,
  RUN_STATUS_META,
  RUN_TRIGGER_LABEL,
  TASK_STATUS_META,
  formatDateTime,
  formatNextRun,
  formatSchedule,
} from '../types';

const { Text, Paragraph } = Typography;

export interface TaskDetailDrawerProps {
  task: BackgroundTaskItem | null;
  open: boolean;
  onClose: () => void;
}

/** 任务详情：基本信息 + 运行记录 + 脚本日志尾部 */
export default function TaskDetailDrawer({
  task,
  open,
  onClose,
}: TaskDetailDrawerProps): React.ReactElement {
  const { token } = theme.useToken();
  const [runs, setRuns] = useState<BackgroundTaskRunItem[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    let cancelled = false;
    setLoading(true);
    setLog(null);
    void (async () => {
      const [runList, logResult] = await Promise.all([
        fetchTaskRuns(task.id, 20),
        task.kind === 'script' ? fetchTaskLog(task.id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setRuns(runList ?? []);
      setLog(logResult?.log ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  const status = task ? TASK_STATUS_META[task.status] : null;

  return (
    <Drawer
      title={task ? `后台任务：${task.title}` : '后台任务'}
      open={open}
      onClose={onClose}
      size={520}
      destroyOnHidden
    >
      {!task ? (
        <Empty description="任务不存在" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-xs" style={{ color: token.colorTextSecondary }}>
            <span>
              状态：<Tag color={status?.color}>{status?.label}</Tag>
              <Tag>{task.kind === 'script' ? '脚本任务' : '定时任务'}</Tag>
            </span>
            <span>规则：{formatSchedule(task)}</span>
            {task.kind === 'schedule' && (
              <span>
                下次触发：{formatNextRun(task)}（{formatDateTime(task.nextRunAt)}）
              </span>
            )}
            <span>
              已触发 {task.runCount} 次{task.kind === 'schedule' ? ` / 上限 ${task.maxRuns}` : ''}
            </span>
            {task.kind === 'script' && (
              <span>
                最大运行时长：
                {task.maxRuntimeSeconds
                  ? `${Math.round(task.maxRuntimeSeconds / 60)} 分钟`
                  : '不限制'}
                {task.deadlineAt ? `（截止 ${formatDateTime(task.deadlineAt)}）` : ''}
              </span>
            )}
            {task.kind === 'schedule' && task.expiresAt && (
              <span>任务有效期至：{formatDateTime(task.expiresAt)}</span>
            )}
            {task.consecutiveFailures > 0 && (
              <Text type="warning" className="text-xs">
                连续失败 {task.consecutiveFailures} 次（连续 3 次自动暂停）
              </Text>
            )}
            <span>创建时间：{formatDateTime(task.createdAt)}</span>
            {task.lastError && (
              <Text type="danger" className="text-xs">
                最近错误：{task.lastError}
              </Text>
            )}
          </div>

          {task.kind === 'script' && task.command && (
            <div>
              <Text strong className="text-xs">
                脚本命令
              </Text>
              <Paragraph
                className="mt-1 max-h-40 overflow-auto rounded p-2 font-mono text-xs"
                style={{ background: token.colorFillQuaternary, marginBottom: 0 }}
              >
                <pre className="whitespace-pre-wrap break-all">{task.command}</pre>
              </Paragraph>
            </div>
          )}
          {task.kind === 'schedule' && task.prompt && (
            <div>
              <Text strong className="text-xs">
                唤醒提示词
              </Text>
              <Paragraph
                className="mt-1 max-h-40 overflow-auto rounded p-2 text-xs whitespace-pre-wrap"
                style={{ background: token.colorFillQuaternary }}
              >
                {task.prompt}
              </Paragraph>
            </div>
          )}
          {task.conditionCommand && (
            <div>
              <Text strong className="text-xs">
                触发条件命令（退出码 0 才唤醒）
              </Text>
              <Paragraph
                className="mt-1 max-h-32 overflow-auto rounded p-2 font-mono text-xs"
                style={{ background: token.colorFillQuaternary }}
              >
                <pre className="whitespace-pre-wrap break-all">{task.conditionCommand}</pre>
              </Paragraph>
            </div>
          )}

          <div>
            <Text strong className="text-xs">
              运行记录
            </Text>
            {loading ? (
              <div className="flex justify-center py-6">
                <Spin size="small" />
              </div>
            ) : runs.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无运行记录"
                className="py-2"
              />
            ) : (
              <List
                size="small"
                dataSource={runs}
                className="mt-1"
                renderItem={(run) => {
                  const meta = RUN_STATUS_META[run.status];
                  return (
                    <List.Item className="px-0">
                      <div className="flex w-full flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <Tag color={meta.color} className="m-0">
                            {meta.label}
                          </Tag>
                          <Tag className="m-0">{RUN_TRIGGER_LABEL[run.trigger]}</Tag>
                          <span style={{ color: token.colorTextSecondary }}>
                            {formatDateTime(run.startedAt)}
                          </span>
                          {run.exitCode !== null && (
                            <span style={{ color: token.colorTextSecondary }}>
                              退出码 {run.exitCode}
                            </span>
                          )}
                        </span>
                        {run.error && (
                          <Text type="danger" className="text-xs">
                            {run.error}
                          </Text>
                        )}
                        {run.output && (
                          <pre
                            className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded p-1 text-[11px]"
                            style={{ background: token.colorFillQuaternary, margin: 0 }}
                          >
                            {run.output}
                          </pre>
                        )}
                        {run.finalContent && (
                          <Text type="secondary" className="text-xs whitespace-pre-wrap">
                            {run.finalContent.slice(0, 300)}
                          </Text>
                        )}
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </div>

          {task.kind === 'script' && (
            <div>
              <Text strong className="text-xs">
                日志尾部
              </Text>
              <pre
                className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded p-2 font-mono text-[11px]"
                style={{ background: token.colorFillQuaternary, margin: 0 }}
              >
                {log ?? '（日志不可用或任务尚未在虚拟机中执行）'}
              </pre>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
