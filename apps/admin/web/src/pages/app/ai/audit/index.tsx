import { useState, useCallback, useEffect } from "react";
import { Card, Table, Button, Input, Select, Space, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { AIToolLogItem } from "@/api/types";
import { fmtDate } from "@/utils/fmtDate";

const statusMap: Record<string, { label: string; color: string }> = {
  success: { label: "成功", color: "green" },
  error: { label: "失败", color: "red" },
  timeout: { label: "超时", color: "orange" },
};

const AIAuditPage = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIToolLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const refresh = useCallback(async (p?: number, ps?: number) => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = {
        page: p ?? page,
        pageSize: ps ?? pageSize,
      };
      if (searchText) query.toolName = searchText;
      if (statusFilter) query.status = statusFilter;
      const { error, data: result } = await client.get("/api/ai/audit", { query }) as {
        error?: unknown;
        data?: { list: AIToolLogItem[]; total: number };
      };
      if (!error && result) {
        setData(result.list);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchText, statusFilter]);

  useEffect(() => { refresh(1); }, []);

  const handleSearch = () => { setPage(1); refresh(1); };
  const handleReset = () => { setSearchText(""); setStatusFilter(undefined); setPage(1); };
  const handlePageChange = (p: number, ps: number) => { setPage(p); setPageSize(ps); refresh(p, ps); };

  const columns: ColumnsType<AIToolLogItem> = [
    { title: "工具名称", dataIndex: "toolName", key: "toolName", render: (text: string) => <Tag color="blue">{text}</Tag> },
    { title: "用户 ID", dataIndex: "userId", key: "userId", ellipsis: true },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status: string) => { const s = statusMap[status] || { label: status, color: "default" }; return <Tag color={s.color}>{s.label}</Tag>; },
    },
    { title: "耗时", dataIndex: "duration", key: "duration", width: 100, render: (ms: number | null) => ms != null ? `${ms}ms` : "-" },
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 180, render: (date: string) => fmtDate(date) },
  ];

  return (
    <Card title={<Space><FileSearchOutlined />AI 审计日志</Space>}
      extra={<Button icon={<ReloadOutlined />} onClick={() => refresh()}>刷新</Button>}>
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="搜索工具名称..." prefix={<SearchOutlined />} value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 200 }} onPressEnter={handleSearch} />
        <Select placeholder="状态筛选" allowClear style={{ width: 120 }} value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          options={[{ label: "成功", value: "success" }, { label: "失败", value: "error" }, { label: "超时", value: "timeout" }]} />
        <Button onClick={handleSearch}>搜索</Button>
        <Button onClick={handleReset}>重置</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, pageSize, total, onChange: handlePageChange }} />
    </Card>
  );
};

export default AIAuditPage;
