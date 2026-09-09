import { client } from '@/api';
import MarkdownPreview from '@/components/MarkdownPreview';
import { Button, Empty, Spin, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';

interface MemoryEvent {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

interface MemoryState {
  content: string;
  events: MemoryEvent[];
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export default function MemoryPanel({ sessionId }: { sessionId?: string }): React.ReactElement {
  const [state, setState] = useState<MemoryState | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return setState(null);
    setLoading(true);
    try {
      const { data } = (await client.get('/api/ai/conversations/:id/memory', {
        params: { id: sessionId },
      })) as { data?: MemoryState };
      setState(data ?? null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (state?.status !== 'pending' && state?.status !== 'processing') return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [state?.status, load]);

  const consolidate = async (): Promise<void> => {
    if (!sessionId) return;
    await client.post('/api/ai/conversations/:id/memory/consolidate', { params: { id: sessionId } });
    await load();
  };

  if (!sessionId) return <div className="flex h-full items-center justify-center"><Empty description="开始对话后可查看会话记忆" /></div>;
  if (loading && !state) return <div className="flex h-full items-center justify-center"><Spin /></div>;

  const status = state?.status ?? 'idle';
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">会话记忆</span>
          <Tag color={status === 'failed' ? 'error' : status === 'completed' ? 'success' : status === 'idle' ? 'default' : 'processing'}>{status}</Tag>
        </div>
        <div className="flex gap-2"><Button onClick={() => void load()}>刷新</Button><Button onClick={() => void consolidate()} loading={status === 'pending' || status === 'processing'}>重新整理</Button></div>
      </div>
      {state?.error && <div className="mb-3 text-red-500">{state.error}</div>}
      <div className="mb-6 rounded-xl border border-solid border-gray-200 p-4"><MarkdownPreview content={state?.content ?? '# 会话记忆\n\n暂无已整理的记忆。'} /></div>
      <div className="mb-2 font-medium">候选事件</div>
      {state?.events.length ? state.events.map((event) => (
        <div key={event.id} className="mb-2 rounded-lg border border-solid border-gray-200 p-3">
          <div className="mb-1 flex items-center gap-2"><Tag>{event.type}</Tag><span className="text-xs text-gray-400">{new Date(event.createdAt).toLocaleString()}</span></div>
          <div>{event.content}</div>
        </div>
      )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前会话尚未产生记忆事件" />}
    </div>
  );
}
