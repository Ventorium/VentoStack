/**
 * 后台任务数据 hooks
 *
 * 对话页需要「轻量轮询 + 有变化就刷新会话历史」，全局页需要分页表格（用 useTable）。
 * 轮询间隔取 6s：脚本任务探活/定时唤醒在服务端是 5s 一轮，再快只会打数据库。
 */
import { App } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelTask,
  fetchSessionRun,
  fetchTasks,
  pauseTask,
  removeTask,
  resumeTask,
  runTaskNow,
} from './api';
import type { BackgroundTaskItem } from './types';

const POLL_INTERVAL_MS = 6_000;

/** 当前会话的后台任务（轮询）；onActivity 在任务状态/最近运行时间变化时触发 */
export function useSessionBackgroundTasks(
  sessionId: string | undefined,
  onActivity?: (tasks: BackgroundTaskItem[]) => void,
): {
  tasks: BackgroundTaskItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  running: boolean;
} {
  const [tasks, setTasks] = useState<BackgroundTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const signatureRef = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setTasks([]);
      setRunning(false);
      return;
    }
    setLoading(true);
    try {
      const [page, run] = await Promise.all([
        fetchTasks({ sessionId, page: 1, pageSize: 50 }),
        fetchSessionRun(sessionId).catch(() => null),
      ]);
      if (!mountedRef.current) return;
      const list = page?.list ?? [];
      const signature = list
        .map((task) => `${task.id}:${task.status}:${task.lastRunAt ?? ''}:${task.runCount}`)
        .join('|');
      setTasks(list);
      setRunning(run?.running === true);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        onActivity?.(list);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [sessionId, onActivity]);

  useEffect(() => {
    signatureRef.current = '';
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, sessionId]);

  return { tasks, loading, refresh, running };
}

export type TaskAction = 'cancel' | 'pause' | 'resume' | 'run' | 'delete';

/** 任务操作（取消/暂停/恢复/立即执行/删除）统一封装：提示 + 刷新 */
export function useTaskActions(refresh: () => Promise<void> | void): {
  act: (action: TaskAction, task: BackgroundTaskItem) => Promise<void>;
  acting: boolean;
} {
  const { message } = App.useApp();
  const [acting, setActing] = useState(false);

  const act = useCallback(
    async (action: TaskAction, task: BackgroundTaskItem) => {
      setActing(true);
      try {
        const result =
          action === 'cancel'
            ? await cancelTask(task.id)
            : action === 'pause'
              ? await pauseTask(task.id)
              : action === 'resume'
                ? await resumeTask(task.id)
                : action === 'run'
                  ? await runTaskNow(task.id)
                  : await removeTask(task.id);
        if (result === null && action !== 'delete') {
          message.error('操作失败，请稍后重试');
          return;
        }
        const labels: Record<TaskAction, string> = {
          cancel: '已取消任务',
          pause: '已暂停任务',
          resume: '已恢复任务',
          run: '已重新加入执行队列',
          delete: '已删除任务',
        };
        message.success(labels[action]);
        await refresh();
      } finally {
        setActing(false);
      }
    },
    [message, refresh],
  );

  return { act, acting };
}
