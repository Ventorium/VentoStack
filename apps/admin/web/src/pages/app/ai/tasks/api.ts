/**
 * 后台任务接口调用层
 *
 * 组件不直接写 `client.xxx(path, ...)`：路径与 query/body 契约集中在生成类型里，
 * 这里统一「信封已拆包、失败返回 null」的处理方式（错误提示由全局拦截器负责）。
 */
import { client } from '@/api';
import type { BackgroundTaskItem, BackgroundTaskRunItem } from './types';

export interface FetchTasksQuery {
  page?: number;
  pageSize?: number;
  sessionId?: string;
  agentId?: string;
  status?: string;
  keyword?: string;
}

export interface TaskPage {
  list: BackgroundTaskItem[];
  total: number;
  page: number;
  pageSize: number;
}

async function pick<T>(promise: Promise<{ error?: unknown; data?: unknown }>): Promise<T | null> {
  const { error, data } = await promise;
  if (error || data === undefined || data === null) return null;
  return data as T;
}

export function fetchTasks(query: FetchTasksQuery = {}): Promise<TaskPage | null> {
  return pick<TaskPage>(client.get('/api/ai/background-tasks', { query }));
}

export function fetchTask(id: string): Promise<BackgroundTaskItem | null> {
  return pick<BackgroundTaskItem>(client.get('/api/ai/background-tasks/:id', { params: { id } }));
}

export function fetchTaskRuns(id: string, limit = 20): Promise<BackgroundTaskRunItem[] | null> {
  return pick<BackgroundTaskRunItem[]>(
    client.get('/api/ai/background-tasks/:id/runs', { params: { id }, query: { limit } }),
  );
}

export function fetchTaskLog(id: string): Promise<{ log: string } | null> {
  return pick<{ log: string }>(client.get('/api/ai/background-tasks/:id/log', { params: { id } }));
}

export function cancelTask(id: string): Promise<BackgroundTaskItem | null> {
  return pick<BackgroundTaskItem>(
    client.post('/api/ai/background-tasks/:id/cancel', { params: { id } }),
  );
}

export function pauseTask(id: string): Promise<BackgroundTaskItem | null> {
  return pick<BackgroundTaskItem>(
    client.post('/api/ai/background-tasks/:id/pause', { params: { id } }),
  );
}

export function resumeTask(id: string): Promise<BackgroundTaskItem | null> {
  return pick<BackgroundTaskItem>(
    client.post('/api/ai/background-tasks/:id/resume', { params: { id } }),
  );
}

export function runTaskNow(id: string): Promise<BackgroundTaskItem | null> {
  return pick<BackgroundTaskItem>(
    client.post('/api/ai/background-tasks/:id/run', { params: { id } }),
  );
}

export function removeTask(id: string): Promise<null | boolean> {
  return pick<null>(client.delete('/api/ai/background-tasks/:id', { params: { id } }));
}

/** 查询会话当前是否有运行（后台任务面板展示「执行中」并避免误触发） */
export function fetchSessionRun(
  sessionId: string,
): Promise<{ running: boolean; kind?: string; startedAt?: string } | null> {
  return pick<{ running: boolean; kind?: string; startedAt?: string }>(
    client.get('/api/ai/chat/sessions/:id/run', { params: { id: sessionId } }),
  );
}
