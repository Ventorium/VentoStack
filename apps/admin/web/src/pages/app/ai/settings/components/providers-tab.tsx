/**
 * AI 设置页 — 供应商管理 Tab
 */
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ProviderItem } from "../types";

export interface ProvidersTabProps {
  providers: ProviderItem[];
  loading: boolean;
  providerColumns: ColumnsType<ProviderItem>;
  onRefresh: () => void;
  onAdd: () => void;
}

export default function ProvidersTab({
  providers,
  loading,
  providerColumns,
  onRefresh,
  onAdd,
}: ProvidersTabProps) {
  return (
<Card
  extra={
    <Space>
      <Button icon={<ReloadOutlined />} onClick={onRefresh}>
        刷新
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
        添加供应商
      </Button>
    </Space>
  }
>
  <Table
    rowKey="id"
    columns={providerColumns}
    dataSource={providers}
    loading={loading}
    size="small"
    pagination={false}
  />
</Card>
  );
}
