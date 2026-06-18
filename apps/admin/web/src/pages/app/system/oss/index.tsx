import { client } from "@/api";
import type { OSSFile } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { msg } from "@/components/GlobalMessage";
import { OSS_API } from "@/constants";
import { useTable } from "@/hooks/useTable";
import { getAccessToken } from "@/store/token";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import {
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Button, Card, Form, Image, Input, Modal, Space, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

const fetcher = (params: Record<string, unknown>) =>
  client.get(OSS_API.LIST, { query: cleanParams(params) });

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const OSSPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<OSSFile>(fetcher);
  const [searchForm] = Form.useForm();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    onSearch(cleanParams(values));
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete(OSS_API.DELETE, { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const handleUploadChange = (info: any) => {
    if (info.file.status === "done") {
      msg.success("上传成功");
      refresh();
    } else if (info.file.status === "error") {
      msg.error("上传失败");
    }
  };

  const uploadProps = {
    name: "file",
    multiple: true,
    action: OSS_API.UPLOAD,
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    onChange: handleUploadChange,
  };

  const handlePreview = async (record: OSSFile) => {
    const { error, data } = (await client.get(OSS_API.SIGNED_URL, {
      params: { id: record.id },
    })) as { error?: unknown; data?: { url: string } };
    if (!error && data?.url) {
      setPreviewImage(data.url);
      setPreviewOpen(true);
    }
  };

  const handleDownload = async (record: OSSFile) => {
    const { error, data } = (await client.get(OSS_API.SIGNED_URL, {
      params: { id: record.id },
    })) as { error?: unknown; data?: { url: string } };
    if (!error && data?.url) {
      window.open(data.url, "_blank");
    }
  };

  const isImage = (contentType: string) => contentType?.startsWith("image/");

  const columns: ColumnsType<OSSFile> = [
    { title: "文件名", dataIndex: "filename", key: "filename", width: 200, ellipsis: true },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (_: unknown, r: OSSFile) => formatFileSize(r.size),
    },
    {
      title: "类型",
      dataIndex: "contentType",
      key: "contentType",
      width: 120,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: "存储桶", dataIndex: "bucket", key: "bucket", width: 120 },
    { title: "上传者", dataIndex: "uploaderName", key: "uploaderName", width: 120 },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: OSSFile) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 150,
      fixed: "right" as const,
      render: (_: unknown, r: OSSFile) => (
        <Space size="small">
          {isImage(r.contentType) && (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(r)}
            />
          )}
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(r)}
          />
          <ActionColumn
            items={[
              {
                label: "删除",
                onClick: () => handleDelete(r.id),
                danger: true,
                confirm: "确定删除该文件？",
              },
            ]}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">文件管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="filename">
            <Input placeholder="文件名" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="bucket">
            <Input placeholder="存储桶" />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setUploadModalOpen(true)}
            >
              上传文件
            </Button>
          </Space>
        </Form>
      </Card>
      <Card title={`文件列表（${total}）`}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: onPageChange,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
      <Modal
        title="上传文件"
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        footer={null}
        width={640}
      >
        <Upload.Dragger
          {...uploadProps}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          maxCount={10}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持单个或批量上传。文件大小限制 50MB</p>
        </Upload.Dragger>
      </Modal>
      <Image
        preview={{
          open: previewOpen,
          src: previewImage,
          onOpenChange: (vis) => setPreviewOpen(vis),
        }}
        className="hidden"
      />
    </div>
  );
};

export default OSSPage;
