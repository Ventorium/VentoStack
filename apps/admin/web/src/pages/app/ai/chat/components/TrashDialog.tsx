import { client } from '@/api';
import { DeleteOutlined, RollbackOutlined } from '@ant-design/icons';
import { Button, Checkbox, Empty, Modal, Popconfirm, Space, Spin, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '../types';
import ChatArea from './ChatArea';

const { Text } = Typography;

interface TrashedSession {
  sessionId: string;
  title: string;
  deletedAt: string;
}

interface TrashDialogProps {
  open: boolean;
  onClose: () => void;
  /** 回收站内容变化（恢复/永久删除）后通知父组件刷新会话列表 */
  onChanged?: () => void;
}

/** 回收站：左侧选择会话，右侧按正常对话样式只读回放 */
export default function TrashDialog({ open, onClose, onChanged }: TrashDialogProps) {
  const [items, setItems] = useState<TrashedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [viewerSession, setViewerSession] = useState<TrashedSession | null>(null);
  const [viewerMessages, setViewerMessages] = useState<ChatMessage[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = await client.get('/api/ai/conversations/trash');
      if (!error && Array.isArray(data)) {
        setItems(data as TrashedSession[]);
        setSelected([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchTrash();
  }, [open, fetchTrash]);

  const toggleSelect = (id: string, checked: boolean): void => {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((sessionId) => sessionId !== id),
    );
  };

  const clearViewerIfAffected = (ids: string[]): void => {
    if (ids.length === 0 || (viewerSession && ids.includes(viewerSession.sessionId))) {
      setViewerSession(null);
      setViewerMessages([]);
    }
  };

  const handleRestore = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const { error } = await client.post('/api/ai/conversations/trash/restore', {
      body: { sessionIds: ids },
    });
    if (!error) {
      message.success('已恢复');
      clearViewerIfAffected(ids);
      await fetchTrash();
      onChanged?.();
    }
  };

  const handlePurge = async (ids: string[]): Promise<void> => {
    const { error } = await client.post('/api/ai/conversations/trash/purge', {
      body: { sessionIds: ids },
    });
    if (!error) {
      message.success(ids.length === 0 ? '回收站已清空' : '已永久删除');
      clearViewerIfAffected(ids);
      await fetchTrash();
      onChanged?.();
    }
  };

  const handleView = async (item: TrashedSession): Promise<void> => {
    setViewerSession(item);
    setViewerMessages([]);
    setViewerLoading(true);
    try {
      const { error, data } = await client.get('/api/ai/conversations/:id/messages', {
        params: { id: item.sessionId },
        query: { limit: 100 },
      });
      if (!error && Array.isArray(data)) {
        setViewerMessages(
          (data as Array<{ role: string; content: string }>)
            // 审批台账行是后端合成行（JSON 信封），回收站只读视图不渲染
            .filter((entry) => entry.role !== 'approval')
            .map((entry, index) => ({
              id: `${item.sessionId}-${index}`,
              role: entry.role === 'user' ? 'user' : 'assistant',
              content: entry.content,
              timestamp: '',
            })),
        );
      }
    } finally {
      setViewerLoading(false);
    }
  };

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <Modal
      title="回收站"
      open={open}
      onCancel={onClose}
      footer={null}
      width={1120}
      centered
      destroyOnHidden
      classNames={{ body: 'h-[72vh] overflow-hidden !p-0' }}
    >
      <div className="h-full min-h-0 flex flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 px-4 dark:border-gray-800">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onChange={(event) =>
              setSelected(event.target.checked ? items.map((item) => item.sessionId) : [])
            }
            disabled={items.length === 0}
          >
            全选
          </Checkbox>
          <Space>
            <Button
              size="small"
              icon={<RollbackOutlined />}
              disabled={selected.length === 0}
              onClick={() => void handleRestore(selected)}
            >
              恢复所选
            </Button>
            <Popconfirm
              title={`永久删除所选 ${selected.length} 个会话？`}
              description="仅删除所选会话，删除后不可恢复"
              okText="永久删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handlePurge(selected)}
              disabled={selected.length === 0}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={selected.length === 0}
              >
                永久删除所选
              </Button>
            </Popconfirm>
            <Popconfirm
              title="清空回收站？"
              description="永久删除回收站内的全部会话，且不可恢复"
              okText="清空全部"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => handlePurge([])}
              disabled={items.length === 0}
            >
              <Button size="small" type="text" danger disabled={items.length === 0}>
                清空回收站
              </Button>
            </Popconfirm>
          </Space>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-[280px] shrink-0 overflow-auto border-r border-gray-100 px-2 py-2 dark:border-gray-800">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <Spin />
              </div>
            ) : items.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="回收站为空"
                className="mt-20"
              />
            ) : (
              items.map((item) => {
                const active = viewerSession?.sessionId === item.sessionId;
                return (
                  <div
                    key={item.sessionId}
                    className={`group mb-1 flex items-start gap-2 rounded-md px-2 py-2 transition-colors ${active ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <Checkbox
                      checked={selected.includes(item.sessionId)}
                      onChange={(event) => toggleSelect(item.sessionId, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <div
                      className="min-w-0 flex-1 cursor-pointer text-left"
                      onClick={() => void handleView(item)}
                    >
                      <Text ellipsis className="block text-[13px]">
                        {item.title}
                      </Text>
                      <Text type="secondary" className="block text-[11px]">
                        删除于 {new Date(item.deletedAt).toLocaleString()}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      aria-label="恢复会话"
                      className="!h-6 !w-6 !min-w-6 !p-0 opacity-0 group-hover:opacity-100"
                      icon={<RollbackOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRestore([item.sessionId]);
                      }}
                    />
                    <Popconfirm
                      title="永久删除该会话？"
                      description="删除后不可恢复"
                      okText="永久删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handlePurge([item.sessionId])}
                    >
                      <Button
                        size="small"
                        type="text"
                        danger
                        aria-label="永久删除会话"
                        className="!h-6 !w-6 !min-w-6 !p-0 opacity-0 group-hover:opacity-100"
                        icon={<DeleteOutlined />}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {viewerSession ? (
              <>
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-gray-100 px-4 dark:border-gray-800">
                  <Text strong ellipsis className="min-w-0 flex-1 pr-3">
                    {viewerSession.title}
                  </Text>
                  <Button
                    size="small"
                    icon={<RollbackOutlined />}
                    onClick={() => void handleRestore([viewerSession.sessionId])}
                  >
                    恢复会话
                  </Button>
                </div>
                <div className="flex flex-1 min-h-0">
                  {viewerLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Spin />
                    </div>
                  ) : viewerMessages.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该会话没有消息" />
                    </div>
                  ) : (
                    <ChatArea messages={viewerMessages} agentName="智能助手" readOnly />
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧选择会话查看内容" />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
