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
      style={{
        width: 260,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 12px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text strong style={{ fontSize: 15 }}>
          会话列表
        </Text>
        <PlusOutlined
          onClick={onNew}
          style={{ cursor: "pointer", color: token.colorPrimary, fontSize: 14 }}
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
      <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
        {filtered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无会话"
            style={{ marginTop: 48 }}
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
                  style={{
                    padding: "10px 12px",
                    borderRadius: token.borderRadiusLG,
                    cursor: "pointer",
                    marginBottom: 2,
                    background: isActive ? token.controlItemBgActive : "transparent",
                    borderLeft: isActive
                      ? `3px solid ${token.colorPrimary}`
                      : "3px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = token.controlItemBgHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      strong={isActive}
                      ellipsis
                      style={{
                        flex: 1,
                        marginRight: 8,
                        fontSize: 13,
                        color: isActive ? token.colorPrimary : token.colorText,
                      }}
                    >
                      {thread.title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                      {thread.updatedAt}
                    </Text>
                  </div>
                  <Text
                    type="secondary"
                    ellipsis
                    style={{ fontSize: 12, display: "block" }}
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
