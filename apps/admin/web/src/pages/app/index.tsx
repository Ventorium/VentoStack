import { client } from "@/api";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  BellOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Modal,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const { Text, Paragraph } = Typography;

// ─── Types ─────────────────────────────────────────

interface DashboardStats {
  userCount: number;
  roleCount: number;
  todayLogs: number;
  unreadNotices: number;
}

interface NoticeItem {
  id: string;
  title: string;
  content: string;
  type: number;
  publishAt: string | null;
  isRead: boolean;
}

interface PublishedNoticesResponse {
  items: NoticeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Constants ──────────────────────────────────────

const NOTICE_TYPE_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "通知", color: "blue" },
  2: { label: "公告", color: "purple" },
};

// ─── Dashboard Page ─────────────────────────────────

const DashboardPage = () => {
  const siteName = usePublicConfig((s) => s.config.siteName);
  const navigate = useNavigate();

  // Stats
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Recent notices
  const [recentNotices, setRecentNotices] = useState<NoticeItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalNotices, setModalNotices] = useState<NoticeItem[]>([]);
  const [modalTotal, setModalTotal] = useState(0);
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize] = useState(10);
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // ─── Data fetching ───────────────────────────────

  useEffect(() => {
    client
      .get("/api/system/dashboard/stats")
      .then((res) => {
        const data = (res as { data?: DashboardStats }).data;
        if (data) setStats(data);
      })
      .finally(() => setStatsLoading(false));
  }, []);

  const fetchRecentNotices = useCallback(() => {
    setRecentLoading(true);
    client
      .get("/api/system/notices/published", { query: { page: 1, pageSize: 5 } })
      .then((res) => {
        const data = (res as { data?: PublishedNoticesResponse }).data;
        if (data?.items) setRecentNotices(data.items);
      })
      .finally(() => setRecentLoading(false));
  }, []);

  useEffect(() => {
    fetchRecentNotices();
  }, [fetchRecentNotices]);

  const refreshStats = useCallback(() => {
    client.get("/api/system/dashboard/stats").then((res) => {
      const data = (res as { data?: DashboardStats }).data;
      if (data) setStats(data);
    });
  }, []);

  const fetchModalNotices = useCallback(
    (page: number) => {
      setModalLoading(true);
      client
        .get("/api/system/notices/published", { query: { page, pageSize: modalPageSize } })
        .then((res) => {
          const data = (res as { data?: PublishedNoticesResponse }).data;
          if (data) {
            setModalNotices(data.items);
            setModalTotal(data.total);
            setModalPage(data.page);
          }
        })
        .finally(() => setModalLoading(false));
    },
    [modalPageSize],
  );

  // ─── Actions ─────────────────────────────────────

  const openModal = useCallback(() => {
    setModalOpen(true);
    setSelectedRowKeys([]);
    fetchModalNotices(1);
  }, [fetchModalNotices]);

  const markRead = useCallback(
    async (id: string) => {
      await client.put("/api/system/notices/:id/read", { params: { id } });
      setRecentNotices((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setModalNotices((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      refreshStats();
    },
    [refreshStats],
  );

  const batchMarkRead = useCallback(async () => {
    if (selectedRowKeys.length === 0) return;
    await client.post("/api/system/notices/batch-read", {
      body: { ids: selectedRowKeys },
    });
    setSelectedRowKeys([]);
    fetchModalNotices(modalPage);
    fetchRecentNotices();
    refreshStats();
  }, [selectedRowKeys, modalPage, fetchModalNotices, fetchRecentNotices, refreshStats]);

  // ─── Navigation helpers ──────────────────────────

  const statCards = useMemo(
    () => [
      {
        title: "用户总数",
        value: stats?.userCount ?? 0,
        icon: <TeamOutlined />,
        color: "#1677ff",
        onClick: () => navigate("/app/system/users"),
      },
      {
        title: "角色数量",
        value: stats?.roleCount ?? 0,
        icon: <SafetyCertificateOutlined />,
        color: "#52c41a",
        onClick: () => navigate("/app/system/roles"),
      },
      {
        title: "今日日志",
        value: stats?.todayLogs ?? 0,
        icon: <FileTextOutlined />,
        color: "#fa8c16",
        onClick: () => navigate("/app/system/logs/operation"),
      },
      {
        title: "未读公告",
        value: stats?.unreadNotices ?? 0,
        icon: <BellOutlined />,
        color: "#722ed1",
        onClick: openModal,
      },
    ],
    [stats, navigate, openModal],
  );

  // ─── Modal table columns ─────────────────────────

  const modalColumns: ColumnsType<NoticeItem> = useMemo(
    () => [
      {
        title: "标题",
        dataIndex: "title",
        key: "title",
        ellipsis: true,
        render: (title: string, record) => (
          <Space>
            {!record.isRead && <Badge status="processing" className="mr-0" />}
            <Text strong={!record.isRead}>{title}</Text>
          </Space>
        ),
      },
      {
        title: "类型",
        dataIndex: "type",
        key: "type",
        width: 80,
        render: (type: number) => {
          const t = NOTICE_TYPE_MAP[type] ?? { label: "通知", color: "blue" };
          return <Tag color={t.color}>{t.label}</Tag>;
        },
      },
      {
        title: "发布时间",
        dataIndex: "publishAt",
        key: "publishAt",
        width: 170,
        render: (val: string | null) => (val ? new Date(val).toLocaleString("zh-CN") : "-"),
      },
      {
        title: "状态",
        key: "readStatus",
        width: 80,
        render: (_: unknown, record: NoticeItem) =>
          record.isRead ? (
            <Text type="secondary">已读</Text>
          ) : (
            <Tag color="orange">未读</Tag>
          ),
      },
      {
        title: "操作",
        key: "action",
        width: 100,
        render: (_: unknown, record: NoticeItem) =>
          record.isRead ? null : (
            <Button type="link" size="small" onClick={() => markRead(record.id)}>
              标记已读
            </Button>
          ),
      },
    ],
    [markRead],
  );

  // ─── Render ──────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">
          工作台
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
          欢迎回来，这里是 {siteName} 管理后台
        </p>
      </div>

      <Row gutter={16}>
        {/* ── Left: 对话区（预留 Agent 入口）── */}
        <Col xs={24} lg={14} xl={14}>
          <Card
            className="h-full"
            styles={{ body: { display: "flex", flexDirection: "column", height: "100%", minHeight: 480 } }}
          >
            <div className="flex items-center gap-2 mb-4">
              <CommentOutlined className="text-blue-500 text-lg" />
              <Text strong className="text-base">智能助手</Text>
              <Tag color="blue" className="ml-1">即将上线</Tag>
            </div>

            {/* 对话消息区 */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {/* 系统欢迎消息 */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <CommentOutlined className="text-white text-sm" />
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg px-4 py-2.5 max-w-[80%]">
                    <Text className="text-sm">
                      你好！我是智能助手，可以帮你快速查询数据、管理配置、排查问题。
                      <br />
                      此功能正在开发中，敬请期待。
                    </Text>
                  </div>
                </div>
              </div>

              {/* 输入框占位 */}
              <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50">
                <Text type="secondary" className="text-sm flex-1">
                  输入消息或指令...（即将上线）
                </Text>
                <Button disabled size="small" type="primary">
                  发送
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        {/* ── Right: 统计 + 通知 ── */}
        <Col xs={24} lg={10} xl={10}>
          <div className="flex flex-col gap-4">
            {/* 统计卡片 */}
            <Spin spinning={statsLoading}>
              <Row gutter={[12, 12]}>
                {statCards.map((card) => (
                  <Col span={12} key={card.title}>
                    <Card
                      hoverable
                      onClick={card.onClick}
                      className="cursor-pointer"
                      styles={{ body: { padding: "16px 20px" } }}
                    >
                      <Statistic
                        title={<span className="text-xs">{card.title}</span>}
                        value={card.value}
                        prefix={
                          <span className="text-base" style={{ color: card.color }}>{card.icon}</span>
                        }
                        valueStyle={{ fontSize: 24 }}
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </Spin>

            {/* 通知公告 */}
            <Card
              size="small"
              title={
                <Space size={8}>
                  <BellOutlined />
                  <span>通知公告</span>
                  {(stats?.unreadNotices ?? 0) > 0 && (
                    <Badge count={stats?.unreadNotices} size="small" />
                  )}
                </Space>
              }
              extra={
                <Button type="link" size="small" onClick={openModal}>
                  更多
                </Button>
              }
            >
              <Spin spinning={recentLoading}>
                {recentNotices.length === 0 ? (
                  <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recentNotices.map((notice) => (
                      <div
                        key={notice.id}
                        className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {!notice.isRead && (
                            <Badge status="processing" className="shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Text
                                strong={!notice.isRead}
                                className="truncate text-sm max-w-[200px]"
                                
                              >
                                {notice.title}
                              </Text>
                              <Tag
                                color={NOTICE_TYPE_MAP[notice.type]?.color ?? "blue"}
                                className="shrink-0 text-[11px]"
                              >
                                {NOTICE_TYPE_MAP[notice.type]?.label ?? "通知"}
                              </Tag>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                          {notice.publishAt && (
                            <Text type="secondary" className="text-xs whitespace-nowrap">
                              {new Date(notice.publishAt).toLocaleDateString("zh-CN")}
                            </Text>
                          )}
                          {!notice.isRead && (
                            <Button
                              type="link"
                              size="small"
                              className="text-xs px-1"
                              onClick={() => markRead(notice.id)}
                            >
                              已读
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Spin>
            </Card>
          </div>
        </Col>
      </Row>

      {/* Notices Modal */}
      <Modal
        title="通知公告"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={780}
        destroyOnHidden
      >
        <div className="flex items-center justify-between mb-4">
          <Space>
            <Checkbox
              checked={
                selectedRowKeys.length > 0 &&
                selectedRowKeys.length === modalNotices.filter((n) => !n.isRead).length
              }
              indeterminate={
                selectedRowKeys.length > 0 &&
                selectedRowKeys.length < modalNotices.filter((n) => !n.isRead).length
              }
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedRowKeys(modalNotices.filter((n) => !n.isRead).map((n) => n.id));
                } else {
                  setSelectedRowKeys([]);
                }
              }}
            >
              全选未读
            </Checkbox>
            {selectedRowKeys.length > 0 && (
              <Text type="secondary">已选 {selectedRowKeys.length} 项</Text>
            )}
          </Space>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={batchMarkRead}
          >
            批量标记已读
          </Button>
        </div>

        <Table<NoticeItem>
          rowKey="id"
          columns={modalColumns}
          dataSource={modalNotices}
          loading={modalLoading}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
            getCheckboxProps: (record) => ({
              disabled: record.isRead,
            }),
          }}
          pagination={{
            current: modalPage,
            pageSize: modalPageSize,
            total: modalTotal,
            onChange: (page) => {
              setSelectedRowKeys([]);
              fetchModalNotices(page);
            },
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: false,
          }}
          size="small"
        />
      </Modal>
    </div>
  );
};

export default DashboardPage;
