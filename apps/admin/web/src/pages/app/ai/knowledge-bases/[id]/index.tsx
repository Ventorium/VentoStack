import { useEffect, useState } from "react";
import { Button, Card, Descriptions, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  FileOutlined,
  FolderOutlined,
  ReloadOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import { client } from "@/api";
import type { KnowledgeBaseItem, FileEntry } from "@/api/types";

// AI 接口尚未注册到 OpenAPI schema，临时使用 any
const aiClient = client as any;

const { Title, Text } = Typography;

const KnowledgeBaseDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [kb, setKb] = useState<KnowledgeBaseItem | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [kbRes, filesRes] = await Promise.all([
        aiClient.get(`/api/ai/knowledge-bases/${id}`),
        aiClient.get(`/api/ai/knowledge-bases/${id}/files`, {
          query: { path: ".", depth: 2 },
        }),
      ]);
      if (!kbRes.error) setKb(kbRes.data as KnowledgeBaseItem);
      if (!filesRes.error) setFiles(filesRes.data as FileEntry[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const fileColumns: ColumnsType<FileEntry> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (text: string, record) => (
        <Space>
          {record.type === "directory" ? <FolderOutlined /> : <FileOutlined />}
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (type: string) => (
        <Tag color={type === "directory" ? "blue" : "default"}>
          {type === "directory" ? "目录" : "文件"}
        </Tag>
      ),
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 120,
      render: (size: number) => {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
      },
    },
    {
      title: "修改时间",
      dataIndex: "modifiedAt",
      key: "modifiedAt",
      width: 180,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/knowledge-bases")}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          {kb?.name || "加载中..."}
        </Title>
      </Space>

      <Card loading={loading}>
        {kb && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="ID">{kb.id}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={kb.status === "active" ? "green" : "default"}>
                {kb.status === "active" ? "活跃" : kb.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {kb.description || "-"}
            </Descriptions.Item>
            <Descriptions.Item label="文件数">{kb.fileCount}</Descriptions.Item>
            <Descriptions.Item label="存储路径">
              <Text code>{kb.basePath}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{kb.createdAt}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{kb.updatedAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card
        title="文件列表"
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </Button>
            <Button type="primary" icon={<UploadOutlined />}>
              上传文件
            </Button>
          </Space>
        }
      >
        <Table
          columns={fileColumns}
          dataSource={files}
          rowKey="path"
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default KnowledgeBaseDetailPage;
