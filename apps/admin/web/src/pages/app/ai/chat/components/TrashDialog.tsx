import { client } from '@/api';
import {
  DeleteOutlined,
  RestOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Empty,
  List,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import type { ChatMessage } from '../types';

const { Text } = Typography;

interface TrashedSession {
  sessionId: string;
  title: string;
  deletedAt: string;
}

interface TrashDialogProps {
  open: boolean;
  onClose: () => void;
  /** 回收站内容变化（恢复/彻底删除）后通知父组件刷新会话列表 */
  onChanged?: () => void;
}

/** 回收站：软删除会话的只读查看、恢复与彻底删除 */
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
    if (open) fetchTrash();
  }, [open, fetchTrash]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((s) => s !== id)));
  };

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await client.post('/api/ai/conversations/trash/restore', {
      body: { sessionIds: ids },
    });
    if (!error) {
      message.success('已恢复');
      await fetchTrash();
      onChanged?.();
    }
  };

  const handlePurge = async (ids: string[]) => {
    const { error } = await client.post('/api/ai/conversations/trash/purge', {
      body: { sessionIds: ids },
    });
    if (!error) {
      message.success(ids.length === 0 ? '回收站已清空' : '已彻底删除');
      await fetchTrash();
      onChanged?.();
    }
  };

  const handleView = async (item: TrashedSession) => {
    setViewerSession(item);
    setViewerLoading(true);
    try {
      const { error, data } = await client.get('/api/ai/conversations/:id/messages', {
        params: { id: item.sessionId },
        query: { limit: 100 },
      });
      if (!error && Array.isArray(data)) {
        setViewerMessages(
          (data as Array<{ role: string; content: string }>).map((m, i) => ({
            id: `${item.sessionId}-${i}`,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
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
    <>
      <Modal
        title="回收站"
        open={open}
        onCancel={onClose}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <div className="flex items-center justify-between mb-3">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.length > 0 && !allSelected}
            onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.sessionId) : [])}
            disabled={items.length === 0}
          >
            全选
          </Checkbox>
          <Space>
            <Button
              size="small"
              icon={<RollbackOutlined />}
              disabled={selected.length === 0}
              onClick={() => handleRestore(selected)}
            >
              恢复所选
            </Button>
            <Popconfirm
              title={`彻底删除所选 ${selected.length} 个会话？`}
              description="删除后不可恢复"
              okText="彻底删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => handlePurge(selected)}
              disabled={selected.length === 0}
            >
              <Button size="small" danger icon={<DeleteOutlined />} disabled={selected.length === 0}>
                彻底删除
              </Button>
            </Popconfirm>
            <Popconfirm
              title="清空回收站？"
              description="全部会话将被彻底删除，不可恢复"
              okText="清空"
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
        {items.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="回收站为空" />
        ) : (
          <List
            size="small"
            loading={loading}
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                className="cursor-pointer"
                onClick={() => handleView(item)}
              >
                <div className="flex items-center gap-2 w-full min-w-0">
                  <Checkbox
                    checked={selected.includes(item.sessionId)}
                    onChange={(e) => toggleSelect(item.sessionId, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <RestOutlined className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Text ellipsis className="block text-[13px]">
                      {item.title}
                    </Text>
                    <Text type="secondary" className="text-xs">
                      删除于 {new Date(item.deletedAt).toLocaleString()}
                    </Text>
                  </div>
                  <Button
                    size="small"
                    type="text"
                    icon={<RollbackOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore([item.sessionId]);
                    }}
                  />
                  <Popconfirm
                    title="彻底删除该会话？"
                    description="删除后不可恢复"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handlePurge([item.sessionId])}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>
                </div>
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* 只读查看回收站会话内容 */}
      <Modal
        title={viewerSession?.title}
        open={viewerSession !== null}
        onCancel={() => setViewerSession(null)}
        footer={
          viewerSession ? (
            <Button type="primary" onClick={() => handleRestore([viewerSession.sessionId])}>
              恢复该会话
            </Button>
          ) : null
        }
        width={640}
        destroyOnHidden
      >
        <div className="max-h-[60vh] overflow-auto">
          {viewerLoading ? (
            <Text type="secondary">加载中...</Text>
          ) : viewerMessages.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无消息" />
          ) : (
            viewerMessages.map((msg) => (
              <div key={msg.id} className="mb-3">
                <Tag color={msg.role === 'user' ? 'blue' : 'green'} className="mb-1">
                  {msg.role === 'user' ? '用户' : '助手'}
                </Tag>
                <div className="whitespace-pre-wrap break-words text-[13px] text-gray-700 dark:text-gray-300">
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}
