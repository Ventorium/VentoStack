import {
  DeleteOutlined,
  EditOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  RestOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Empty, Input, Space, Spin, theme, Typography } from "antd";
import { useState, type UIEvent } from "react";
import type { Thread } from "../types";

const { Text } = Typography;

interface ThreadListProps {
  threads: Thread[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
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
  const [search, setSearch] = useState("");
  const { token } = theme.useToken();

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
      className="w-[200px] h-full flex flex-col shrink-0" style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between" style={{ padding: "12px 12px 8px" }}
      >
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
          className="cursor-pointer text-sm" style={{ color: token.colorPrimary }}
        />
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 8px" }}>
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
      <div className="flex-1 overflow-auto px-[4px]" onScroll={handleScroll} >
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无会话"
            className="mt-12"
          />
        ) : (
          <>
            {filtered.map((thread) => {
              const isActive = thread.id === activeId;
              return (
                <Dropdown
                  key={thread.id}
                  trigger={["contextMenu"]}
                  menu={{
                    items: [
                      { key: "rename", icon: <EditOutlined />, label: "重命名" },
                      { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
                    ],
                    onClick: ({ key }) => {
                      if (key === "delete") onDelete?.(thread.id);
                      if (key === "rename") onRename?.(thread.id);
                    },
                  }}
                >
                  <div
                    onClick={() => onSelect?.(thread.id)}
                    className="cursor-pointer mb-0.5" style={{ padding: "8px 10px", borderRadius: token.borderRadiusLG, background: isActive ? token.controlItemBgActive : "transparent", borderLeft: isActive ? `3px solid ${token.colorPrimary}` : "3px solid transparent", transition: "all 0.15s ease" }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = token.controlItemBgHover;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Text
                      strong={isActive}
                      ellipsis
                      className="block text-[13px] mb-0.5" style={{ color: isActive ? token.colorPrimary : token.colorText }}
                    >
                      {thread.title}
                    </Text>
                    <Text
                      type="secondary"
                      ellipsis
                      className="text-xs block"
                    >
                      {thread.lastMessage}
                    </Text>
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
          <Button
            block
            type="text"
            size="small"
            icon={<RestOutlined />}
            onClick={onOpenTrash}
          >
            回收站
          </Button>
        </div>
      )}
    </div>
  );
}
