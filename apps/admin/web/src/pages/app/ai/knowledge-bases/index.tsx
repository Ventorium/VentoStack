import { client } from "@/api";
import type { KnowledgeBaseItem } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import { fmtDate } from "@/utils/fmtDate";
import {
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Statistic,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import KnowledgeBaseBrowser from "./components/KnowledgeBaseBrowser";
import { Drawer } from "antd";

// 知识库卡片 hover 显示删除按钮
const kbCardStyle = document.createElement("style");
kbCardStyle.textContent = `
  .kb-card-btn { opacity: 0; transition: opacity 0.2s; }
  .kb-grid-card:hover .kb-card-btn { opacity: 1; }
`;
if (!document.getElementById("kb-card-hover-style")) {
  kbCardStyle.id = "kb-card-hover-style";
  document.head.appendChild(kbCardStyle);
}



const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function KnowledgeBasesPage() {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<KnowledgeBaseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editKb, setEditKb] = useState<KnowledgeBaseItem | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);
  const [drawerKbId, setDrawerKbId] = useState<string | null>(null);
  const [drawerKbName, setDrawerKbName] = useState<string>("");
  const [breadcrumb, setBreadcrumb] = useState<React.ReactNode>(null);

  const refresh = useCallback(
    async (p?: number, ps?: number) => {
      setLoading(true);
      try {
        const currentPage = p ?? page;
        const currentPageSize = ps ?? pageSize;
        const { error, data: result } = (await client.get("/api/ai/knowledge-bases", {
          query: {
            page: currentPage,
            pageSize: currentPageSize,
            name: searchText || undefined,
          },
        })) as { error?: unknown; data?: { list: KnowledgeBaseItem[]; total: number } };
        if (!error && result) {
          setData(result.list);
          setTotal(result.total);
        }
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, searchText],
  );

  useEffect(() => {
    refresh(1);
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const { error } = await client.post("/api/ai/knowledge-bases", { body: values });
      if (!error) {
        msg.success("创建成功");
        setModalOpen(false);
        form.resetFields();
        refresh(1);
      }
    } catch {
    } finally {
      setModalLoading(false);
    }
  };

  const handleOpenEdit = (record: KnowledgeBaseItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditKb(record);
    editForm.setFieldsValue({ name: record.name, description: record.description });
    setEditModalOpen(true);
  };

  const handleEditKb = async () => {
    if (!editKb) return;
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      const { error } = await client.put("/api/ai/knowledge-bases/:id", {
        params: { id: editKb.id },
        body: values,
      });
      if (!error) {
        msg.success("更新成功");
        setEditModalOpen(false);
        refresh();
      }
    } catch {} finally {
      setEditLoading(false);
    }
  };

  const handleDelete = (record: KnowledgeBaseItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除知识库「${record.name}」吗？此操作不可恢复。`,
      okText: "删除",
      okType: "danger",
      onOk: async () => {
        const { error } = await client.delete("/api/ai/knowledge-bases/:id", {
          params: { id: record.id },
        });
        if (!error) {
          msg.success("删除成功");
          refresh();
        }
      },
    });
  };

  return (
    <>
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            <span>知识库管理</span>
            <Tag>{total}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              创建知识库
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索知识库..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            onPressEnter={() => {
              setPage(1);
              refresh(1);
            }}
            allowClear
          />
          <Button
            onClick={() => {
              setPage(1);
              refresh(1);
            }}
          >
            搜索
          </Button>
        </Space>

        {data.length === 0 && !loading ? (
          <Empty description="暂无知识库" style={{ padding: "60px 0" }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              创建知识库
            </Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {data.map((kb) => (
              <Col key={kb.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  className="kb-grid-card"
                  onClick={() => { setDrawerKbId(kb.id); setDrawerKbName(kb.name); }}
                  style={{
                    height: "100%",
                    borderColor: token.colorBorderSecondary,
                  }}
                  styles={{
                    body: { padding: 16, display: "flex", flexDirection: "column", gap: 12 },
                  }}
                >
                  {/* Header */}
                  <div className="kb-card-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: token.borderRadius,
                        background: token.colorPrimaryBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        color: token.colorPrimary,
                      }}
                    >
                      <FolderOutlined />
                    </div>
                    <div className="flex gap-1">
                      <Tooltip title="编辑">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => handleOpenEdit(kb, e)}
                          className="kb-card-btn"
                        />
                      </Tooltip>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => handleDelete(kb, e)}
                          className="kb-card-btn"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  {/* Name & Description */}
                  <div>
                    <Text
                      strong
                      ellipsis
                      style={{ fontSize: 15, display: "block", marginBottom: 4 }}
                    >
                      {kb.name}
                    </Text>
                    <Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 12, marginBottom: 0, minHeight: 36 }}
                    >
                      {kb.description || "暂无描述"}
                    </Paragraph>
                  </div>

                  {/* Meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: "auto",
                      paddingTop: 8,
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <Space size={4}>
                      <FileOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {kb.fileCount} 文件
                      </Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {fmtDate(kb.updatedAt)}
                    </Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* 知识库文件浏览器 Drawer */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600 }}>{drawerKbName}</span>
            {breadcrumb}
          </div>
        }
        open={!!drawerKbId}
        onClose={() => { setDrawerKbId(null); setBreadcrumb(null); }}
        placement="bottom"
        size="large"
        destroyOnClose
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      >
        {drawerKbId && <KnowledgeBaseBrowser kbId={drawerKbId} onBreadcrumb={setBreadcrumb} />}
      </Drawer>

      <Modal
        title="创建知识库" 
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={modalLoading}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入知识库名称" }]}
          >
            <Input placeholder="例如：产品文档" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={3} placeholder="知识库描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑知识库"
        open={editModalOpen}
        onOk={handleEditKb}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入知识库名称" }]}>
            <Input placeholder="知识库名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={3} placeholder="知识库描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
