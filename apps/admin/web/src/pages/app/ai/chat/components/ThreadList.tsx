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
  Tooltip,
  Typography,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import { type PointerEvent as ReactPointerEvent, type UIEvent, useRef, useState } from 'react';
import type { Thread } from '../types';

const { Text } = Typography;

/** 会话列表默认宽度（px） */
export const DEFAULT_WIDTH = 232;
/** 会话列表最小宽度（px）：再窄放不下「会话列表」标题与新建按钮 */
export const MIN_WIDTH = 180;
/** 会话列表最大宽度（px）：再宽会挤掉对话区 */
export const MAX_WIDTH = 420;

/** 行副标题：后端列表接口暂不返回消息预览，退化为更新时间（今天只显示时间） */
function formatUpdatedAt(value: string): string {
  const at = dayjs(value);
  if (!at.isValid()) return '';
  return at.isSame(dayjs(), 'day') ? `今天 ${at.format('HH:mm')}` : at.format('MM-DD HH:mm');
}

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

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
  /** 面板宽度（px，由父组件持有，收起再展开不丢） */
  width: number;
  onWidthChange: (width: number) => void;
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
  width,
  onWidthChange,
}: ThreadListProps) {
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
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

  // ── 宽度拖拽（指针捕获：移出面板也能继续拖） ──
  const handleResizeStart = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleResizeMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onWidthChange(clampWidth(drag.startWidth + e.clientX - drag.startX));
  };
  const handleResizeEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <>
      <div
        className="flex h-full shrink-0 flex-col"
        style={{ width, background: token.colorBgContainer }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <Space size={4}>
            {onCollapse && (
              <Tooltip title="收起会话列表">
                <Button
                  type="text"
                  size="small"
                  aria-label="收起会话列表"
                  icon={<MenuFoldOutlined />}
                  onClick={onCollapse}
                />
              </Tooltip>
            )}
            <Text strong className="text-[15px]">
              会话列表
            </Text>
          </Space>
          <Tooltip title="新建会话">
            <Button
              type="text"
              size="small"
              aria-label="新建会话"
              icon={<PlusOutlined />}
              onClick={onNew}
              style={{ color: token.colorPrimary }}
            />
          </Tooltip>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
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
        <div className="flex-1 overflow-auto px-2 pb-1" onScroll={handleScroll}>
          {filtered.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" className="mt-12" />
          ) : (
            <>
              {filtered.map((thread) => {
                const isActive = thread.id === activeId;
                // 悬浮操作条用同色渐变遮罩，标题因此可用满整行宽度
                const actionsBg = isActive ? token.controlItemBgActive : token.controlItemBgHover;
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
                    <div
                      onMouseEnter={() => setHoverId(thread.id)}
                      onMouseLeave={() =>
                        setHoverId((current) => (current === thread.id ? null : current))
                      }
                      className="group relative mb-1 rounded-lg transition-colors last:mb-0"
                      style={{
                        background: isActive
                          ? token.controlItemBgActive
                          : hoverId === thread.id
                            ? token.controlItemBgHover
                            : 'transparent',
                      }}
                    >
                      {renaming?.id === thread.id ? (
                        <div className="px-2.5 py-1.5">
                          <Input
                            className="min-w-0"
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
                        </div>
                      ) : (
                        // 行本身是 <button>（键盘可达）；悬浮操作条是其兄弟节点，避免按钮嵌套
                        <button
                          type="button"
                          onClick={() => onSelect?.(thread.id)}
                          className="block w-full cursor-pointer border-none bg-transparent px-2.5 py-2 text-left font-inherit"
                        >
                          <Text
                            strong={isActive}
                            title={thread.title}
                            className="block w-full truncate text-[13px]"
                            style={{ color: isActive ? token.colorPrimary : token.colorText }}
                          >
                            {thread.title}
                          </Text>
                          <Text
                            type="secondary"
                            title={thread.lastMessage || thread.updatedAt}
                            className="mt-0.5 block w-full truncate text-xs"
                          >
                            {thread.lastMessage || formatUpdatedAt(thread.updatedAt)}
                          </Text>
                        </button>
                      )}
                      {/* hover 操作：浮在行尾，不再为按钮预留宽度 */}
                      {renaming?.id !== thread.id && (
                        <div
                          className="pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 rounded-md pl-8 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                          style={{
                            background: `linear-gradient(to right, transparent, ${actionsBg} 32px)`,
                          }}
                        >
                          <Tooltip title="重命名">
                            <Button
                              type="text"
                              size="small"
                              className="!h-6 !w-6 !min-w-6 !p-0"
                              aria-label="重命名会话"
                              icon={<EditOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenaming({ id: thread.id, value: thread.title });
                              }}
                            />
                          </Tooltip>
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
                              className="!h-6 !w-6 !min-w-6 !p-0 hover:!text-red-500"
                              aria-label="删除会话"
                              icon={<DeleteOutlined />}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>
                        </div>
                      )}
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
          <div
            className="px-3 py-2"
            style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}
          >
            <Button block type="text" size="small" icon={<RestOutlined />} onClick={onOpenTrash}>
              回收站
            </Button>
          </div>
        )}
      </div>

      {/* 宽度拖拽手柄：自带 1px 分隔线（放在列表右侧，不压住列表滚动条） */}
      <button
        type="button"
        aria-label="调整会话列表宽度"
        title="拖拽调整宽度，双击复位"
        className="group/resize relative h-full w-[5px] shrink-0 cursor-col-resize border-none bg-transparent p-0"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onDoubleClick={() => onWidthChange(DEFAULT_WIDTH)}
        onKeyDown={(e) => {
          // 键盘可达：左右方向键按 16px 步进调整
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          onWidthChange(clampWidth(width + (e.key === 'ArrowRight' ? 16 : -16)));
        }}
      >
        <span
          className="absolute inset-y-0 left-0 block w-px transition-all group-hover/resize:w-[3px] group-hover/resize:bg-[var(--ant-color-primary)]"
          style={
            resizing
              ? { width: 3, background: token.colorPrimary }
              : { background: token.colorBorderSecondary }
          }
        />
      </button>
    </>
  );
}
