import { client } from "@/api";
import type { LoginLogItem, PaginatedData } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { msg } from "@/components/GlobalMessage";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/system/login-logs", { query: cleanParams(params) }) as Promise<{
    error?: unknown;
    data?: PaginatedData<LoginLogItem>;
  }>;

const LoginLogPage = () => {
  const { loading, data, total, page, pageSize, onSearch, onReset, onPageChange } =
    useTable<LoginLogItem>(fetcher);
  const [searchForm] = Form.useForm();

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    onSearch(cleanParams(values));
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const columns: ColumnsType<LoginLogItem> = [
    { title: "用户", dataIndex: "username", key: "username", width: 120 },
    {
      title: "IP / 位置",
      key: "ipLocation",
      width: 200,
      ellipsis: true,
      render: (_: unknown, r: LoginLogItem) => {
        const loc = r.location ? ` (${r.location})` : "";
        return <span className="font-mono text-sm">{r.ip}{loc}</span>;
      },
    },
    { title: "浏览器", dataIndex: "browser", key: "browser", width: 160, ellipsis: true },
    { title: "操作系统", dataIndex: "os", key: "os", width: 120, ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: LoginLogItem) => (
        <Tag color={r.status === 1 ? "green" : "red"}>{r.status === 1 ? "成功" : "失败"}</Tag>
      ),
    },
    {
      title: "登录方式",
      dataIndex: "loginMethod",
      key: "loginMethod",
      width: 100,
      render: (v: string) => {
        const map: Record<string, { label: string; color: string }> = {
          password: { label: "密码", color: "default" },
          mfa: { label: "MFA", color: "blue" },
          passkey: { label: "Passkey", color: "green" },
        };
        const info = map[v] || { label: v || "密码", color: "default" };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: "信息",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      render: (v: string) => (
        <>
          {v}
          {(v?.includes("锁定") || v?.includes("拉黑")) && (
            <Tag color="orange" className="ml-2">
              账户异常
            </Tag>
          )}
        </>
      ),
    },
    {
      title: "登录时间",
      dataIndex: "loginAt",
      key: "loginAt",
      width: 180,
      render: (_: unknown, r: LoginLogItem) => fmtDate(r.loginAt),
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      fixed: "right" as const,
      render: (_: unknown, r: LoginLogItem) => (
        <ActionColumn
          items={[
            ...(r.status === 0 && r.userId
              ? [
                  {
                    label: "解锁用户",
                    onClick: async () => {
                      const { error } = await client.put("/api/system/users/:id/unlock", {
                        params: { id: r.userId },
                      });
                      if (!error) {
                        msg.success("已解锁");
                      }
                    },
                  },
                ]
              : []),
          ]}
          maxInline={1}
        />
      ),
    },
  ];

  return (
    <div>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="username">
            <Input placeholder="用户名" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear className="w-[120px]">
              <Select.Option value={1}>成功</Select.Option>
              <Select.Option value={0}>失败</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button
              danger
              onClick={async () => {
                const { error } = await client.delete("/api/system/login-logs");
                if (!error) {
                  msg.success("日志已清空");
                  handleReset();
                }
              }}
            >
              清空日志
            </Button>
          </Space>
        </Form>
      </Card>
      <Card title={`登录日志（${total}）`}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: onPageChange,
          }}
          scroll={{ x: 1100 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default LoginLogPage;
