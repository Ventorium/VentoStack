import {
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  RestOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Typography,
  theme,
} from 'antd';
import { type UIEvent, useState } from 'react';
import type { Thread } from '../types';

const { Text } = Typography;

interface ThreadListProps {
  threads: Thread[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  onDelete?: (id: string) => void;
  /** 重命名会话（提交时回调，title 已 trim） */
  onRename?: (id: string, title: string) => void;
  /** 滚动到底部时加载更多 */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** 收起会话列表（收起后由父组件渲染窄栏） */
  onCollapse?: () => void;
  /** 打开回收站 */
  onOpenTrash?: () => void;
}

export default function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onLoadMore,
  hasMore,
  loadingMore,
  onCollapse,
  onOpenTrash,
}: ThreadListProps) {
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const { token } = theme.useToken();

  /** 提交重命名：空标题视为取消，不发出请求 */
  const commitRename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    setRenaming(null);
    if (value) onRename?.(renaming.id, value);
  };

  const filtered = threads.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.lastMessage.toLowerCase().includes(search.toLowerCase()),
  );

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
      onLoadMore();
    }
  };

  return (
    <div
      className="w-[200px] h-full flex flex-col shrink-0"
      style={{
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '12px 12px 8px' }}>
        <Space size={4}>
          {onCollapse && (
            <Button
              type="text"
              size="small"
              icon={<MenuFoldOutlined />}
              onClick={onCollapse}
              title="收起会话列表"
            />
          )}
          <Text strong className="text-[15px]">
            会话列表
          </Text>
        </Space>
        <PlusOutlined
          onClick={onNew}
          className="cursor-pointer text-sm"
          style={{ color: token.colorPrimary }}
        />
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <Input
          prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
          placeholder="搜索对话..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="small"
        />
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-auto px-[4px]" onScroll={handleScroll}>
        {filtered.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" className="mt-12" />
        ) : (
          <>
            {filtered.map((thread) => {
              const isActive = thread.id === activeId;
              return (
                <Dropdown
                  key={thread.id}
                  trigger={['contextMenu']}
                  menu={{
                    items: [
                      { key: 'rename', icon: <EditOutlined />, label: '重命名' },
                      { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'delete') {
                        Modal.confirm({
                          title: '将该会话移入回收站？',
                          content: '移入后可在回收站恢复。',
                          okText: '移入回收站',
                          okButtonProps: { danger: true },
                          onOk: () => onDelete?.(thread.id),
                        });
                      }
                      if (key === 'rename') setRenaming({ id: thread.id, value: thread.title });
                    },
                  }}
                >
                  <div className="group">
                    <div
                      onClick={() => onSelect?.(thread.id)}
                      className="mb-0.5 flex cursor-pointer items-start gap-1 px-10px py-2 transition-all transition-ease-DEFAULT"
                      style={{
                        // borderRadius: token.borderRadiusLG,
                        background: isActive ? token.controlItemBgActive : 'transparent',
                        borderLeft: isActive
                          ? `3px solid ${token.colorPrimary}`
                          : '3px solid transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = token.controlItemBgHover;
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {renaming?.id === thread.id ? (
                        <Input
                          className="min-w-0 flex-1"
                          size="small"
                          autoFocus
                          maxLength={60}
                          value={renaming.value}
                          onChange={(e) => setRenaming({ id: thread.id, value: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          onPressEnter={commitRename}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                        />
                      ) : (
                        <div className="min-w-0 flex-1">
                          <Text
                            strong={isActive}
                            ellipsis
                            className="block text-[13px] mb-0.5"
                            style={{ color: isActive ? token.colorPrimary : token.colorText }}
                          >
                            {thread.title}
                          </Text>
                          <Text type="secondary" ellipsis className="text-xs block">
                            {thread.lastMessage}
                          </Text>
                        </div>
                      )}
                      {/* hover 操作：在布局中占位，避免覆盖标题 */}
                      {renaming?.id !== thread.id && (
                        <div className="ml-auto flex shrink-0 items-center gap-0 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto">
                          <Button
                            type="text"
                            size="small"
                            className="!h-6 !w-6 !min-w-6 !p-0 text-gray-400 hover:!bg-transparent"
                            aria-label="重命名会话"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenaming({ id: thread.id, value: thread.title });
                            }}
                          />
                          <Popconfirm
                            title="将该会话移入回收站？"
                            description="移入后可在回收站恢复"
                            okText="移入回收站"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => onDelete?.(thread.id)}
                          >
                            <Button
                              type="text"
                              size="small"
                              className="!h-6 !w-6 !min-w-6 !p-0 text-gray-400 hover:!bg-transparent hover:!text-red-500"
                              aria-label="删除会话"
                              icon={<DeleteOutlined />}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>
                        </div>
                      )}
                    </div>
                  </div>
                </Dropdown>
              );
            })}
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Spin size="small" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer：回收站入口 */}
      {onOpenTrash && (
        <div className="px-3 py-2" style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
          <Button block type="text" size="small" icon={<RestOutlined />} onClick={onOpenTrash}>
            回收站
          </Button>
        </div>
      )}
    </div>
  );
}
