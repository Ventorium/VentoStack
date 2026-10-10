/**
 * AI 智能能力管理 — 工具 (Tools)
 */
import { client } from "@/api";
import type { AIToolItem } from "@/api/types";
import {
  AppstoreOutlined,
  BlockOutlined,
  CodeOutlined,
  EyeOutlined,
  FileOutlined,
  FolderOutlined,
  FunctionOutlined,
  ReloadOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Button, Descriptions, Modal, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";

const { Text, Title, Paragraph } = Typography;

export default function ToolsTab() {
  const [tools, setTools] = useState<AIToolItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailTool, setDetailTool] = useState<AIToolItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get("/api/ai/tools")) as { error?: unknown; data?: AIToolItem[] };
      if (!error && data) setTools(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const riskColor: Record<string, string> = {
    low: "green", medium: "orange", high: "red", critical: "magenta",
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    terminal: <CodeOutlined className="text-[#722ed1]" />,
    calculator: <FunctionOutlined className="text-[#13c2c2]" />,
    sql_query: <BlockOutlined className="text-[#eb2f96]" />,
  };

  const getIcon = (name: string) => {
    if (name.startsWith("fs_")) return <FolderOutlined className="text-[#52c41a]" />;
    if (name.startsWith("kb_")) return <AppstoreOutlined className="text-[#1677ff]" />;
    if (name.startsWith("file_")) return <FileOutlined className="text-[#faad14]" />;
    return categoryIcons[name] ?? <ToolOutlined className="text-[#666]" />;
  };

  const columns: ColumnsType<AIToolItem> = [
    {
      title: "工具", dataIndex: "name", width: 200,
      render: (v: string, r: AIToolItem) => (
        <Space>
          {getIcon(v)}
          <div>
            <div className="font-medium" style={{ fontFamily: "monospace" }}>{v}</div>
            <Text type="secondary" className="text-xs">{r.description}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "风险等级", dataIndex: "riskLevel", width: 100,
      render: (v: string) => <Tag color={riskColor[v] ?? "default"}>{v}</Tag>,
    },
    {
      title: "需要审批", dataIndex: "requiresApproval", width: 80,
      render: (v: boolean) => v ? <Tag color="orange">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "参数", dataIndex: "parameters", width: 80,
      render: (v: AIToolItem["parameters"]) => <Tag>{v.length} 个</Tag>,
    },
    {
      title: "超时", dataIndex: "timeout", width: 80,
      render: (v: number) => `${(v / 1000).toFixed(0)}s`,
    },
    {
      title: "操作", width: 80,
      render: (_: unknown, r: AIToolItem) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailTool(r)}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <Text type="secondary">系统已注册的内置工具。这些工具由 AI Agent 在对话中自动调用。</Text>
        <Button icon={<ReloadOutlined />} onClick={refresh} />
      </div>

      <Table rowKey="name" columns={columns} dataSource={tools} loading={loading} pagination={false} size="small" scroll={{ x: 700 }} />

      {/* 工具详情 Modal */}
      <Modal
        title={detailTool?.name}
        open={!!detailTool}
        onCancel={() => setDetailTool(null)}
        footer={null}
        width={600}
      >
        {detailTool && (
          <div>
            <Descriptions column={2} size="small" className="mb-4">
              <Descriptions.Item label="风险等级">
                <Tag color={riskColor[detailTool.riskLevel] ?? "default"}>{detailTool.riskLevel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="需要审批">
                {detailTool.requiresApproval ? <Tag color="orange">是</Tag> : <Tag>否</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="超时时间">{(detailTool.timeout / 1000).toFixed(0)} 秒</Descriptions.Item>
              <Descriptions.Item label="参数数量">{detailTool.parameters.length} 个</Descriptions.Item>
            </Descriptions>
            <Title level={5}>说明</Title>
            <Paragraph>{detailTool.description}</Paragraph>
            <Title level={5}>参数列表</Title>
            <Table
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={detailTool.parameters}
              columns={[
                { title: "名称", dataIndex: "name", width: 120, render: (v: string) => <code>{v}</code> },
                { title: "类型", dataIndex: "type", width: 80 },
                { title: "说明", dataIndex: "description" },
                { title: "必填", dataIndex: "required", width: 60, render: (v: boolean) => v ? <Tag color="red">必填</Tag> : <Tag>可选</Tag> },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────