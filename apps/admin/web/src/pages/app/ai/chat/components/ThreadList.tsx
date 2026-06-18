import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Badge, Dropdown, Empty, Input, Space, theme, Typography } from "antd";
import { useState } from "react";
import type { Thread } from "../types";

const { Text } = Typography;

interface ThreadListProps {
  threads: Thread[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
}

export default function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ThreadListProps) {
  const [search, setSearch] = useState("");
  const { token } = theme.useToken();

  const filtered = threads.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.lastMessage.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      className="w-[260px] h-full flex flex-col shrink-0" style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between" style={{ padding: "12px 12px 8px" }}
      >
        <Text strong className="text-[15px]">
          会话列表
        </Text>
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
      <div className="flex-1 overflow-auto px-[4px]" >
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无会话"
            className="mt-12"
          />
        ) : (
          filtered.map((thread) => {
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
                  className="cursor-pointer mb-0.5" style={{ padding: "10px 12px", borderRadius: token.borderRadiusLG, background: isActive ? token.controlItemBgActive : "transparent", borderLeft: isActive ? `3px solid ${token.colorPrimary}` : "3px solid transparent", transition: "all 0.15s ease" }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = token.controlItemBgHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    className="flex items-center justify-between mb-1"
                  >
                    <Text
                      strong={isActive}
                      ellipsis
                      className="flex-1 mr-2 text-[13px]" style={{ color: isActive ? token.colorPrimary : token.colorText }}
                    >
                      {thread.title}
                    </Text>
                    <Text type="secondary" className="text-[11px] shrink-0">
                      {thread.updatedAt}
                    </Text>
                  </div>
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
          })
        )}
      </div>
    </div>
  );
}
