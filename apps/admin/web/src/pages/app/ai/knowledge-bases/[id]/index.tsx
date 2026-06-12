import { client } from "@/api";
import type { KnowledgeBaseItem, FileEntry } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOutlined,
  HomeOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

/** 格式化文件大小 */
function formatSize(size: number): string {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeBaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // ── 状态 ──
  const [kb, setKb] = useState<KnowledgeBaseItem | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(".");

  // 文件预览/编辑
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 新建操作
  const [newDirModal, setNewDirModal] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameModal, setRenameModal] = useState<{ visible: boolean; path: string; name: string }>({
    visible: false,
    path: "",
    name: "",
  });

  // ── 面包屑路径解析 ──
  const pathParts = useMemo(() => {
    if (currentPath === "." || currentPath === "") return [];
    return currentPath.split("/").filter(Boolean);
  }, [currentPath]);

  // ── 加载知识库信息 ──
  const fetchKb = useCallback(async () => {
    if (!id) return;
    const { error, data } = (await client.get("/api/ai/knowledge-bases/:id", {
      params: { id },
    })) as { error?: unknown; data?: KnowledgeBaseItem };
    if (!error) setKb(data ?? null);
  }, [id]);

  // ── 加载文件列表 ──
  const fetchFiles = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { error, data } = (await client.get("/api/ai/knowledge-bases/:id/files", {
        params: { id },
        query: { path: currentPath, depth: 1 },
      })) as { error?: unknown; data?: FileEntry[] };
      if (!error) setFiles(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [id, currentPath]);

  useEffect(() => {
    fetchKb();
  }, [fetchKb]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── 打开文件预览 ──
  const handleOpenFile = useCallback(
    async (filePath: string) => {
      if (!id) return;
      setPreviewLoading(true);
      setPreviewFile(filePath);
      setEditing(false);
      try {
        const { error, data } = (await client.get("/api/ai/knowledge-bases/:id/files/*", {
          params: { id, "*": filePath },
        })) as { error?: unknown; data?: { content: string; title: string } };
        if (!error && data) {
          setPreviewContent(data.content);
          setEditContent(data.content);
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [id],
  );

  // ── 保存文件 ──
  const handleSave = useCallback(async () => {
    if (!id || !previewFile) return;
    setSaving(true);
    try {
      const { error } = await client.put(`/api/ai/knowledge-bases/${id}/files/*`, {
        params: { id, "*": previewFile },
        body: { content: editContent },
      });
      if (!error) {
        msg.success("保存成功");
        setPreviewContent(editContent);
        setEditing(false);
        // README 会自动刷新，重新加载文件列表
        fetchFiles();
        fetchKb();
      }
    } finally {
      setSaving(false);
    }
  }, [id, previewFile, editContent, fetchFiles, fetchKb]);

  // ── 新建目录 ──
  const handleCreateDir = useCallback(async () => {
    if (!id || !newDirName.trim()) return;
    const dirPath = currentPath === "." ? newDirName.trim() : `${currentPath}/${newDirName.trim()}`;
    const { error } = await client.post(`/api/ai/knowledge-bases/${id}/mkdir`, {
      params: { id },
      body: { path: dirPath },
    });
    if (!error) {
      msg.success("目录创建成功");
      setNewDirModal(false);
      setNewDirName("");
      fetchFiles();
    }
  }, [id, newDirName, currentPath, fetchFiles]);

  // ── 新建文件 ──
  const handleCreateFile = useCallback(async () => {
    if (!id || !newFileName.trim()) return;
    const fileName = newFileName.trim().endsWith(".md")
      ? newFileName.trim()
      : `${newFileName.trim()}.md`;
    const filePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;
    const { error } = await client.put(`/api/ai/knowledge-bases/${id}/files/*`, {
      params: { id, "*": filePath },
      body: { content: `# ${fileName.replace(/\.md$/, "")}\n\n` },
    });
    if (!error) {
      msg.success("文件创建成功");
      setNewFileModal(false);
      setNewFileName("");
      fetchFiles();
      fetchKb();
    }
  }, [id, newFileName, currentPath, fetchFiles, fetchKb]);

  // ── 重命名 ──
  const handleRename = useCallback(async () => {
    if (!id || !renameModal.path || !renameModal.name.trim()) return;
    const { error } = await client.post(`/api/ai/knowledge-bases/${id}/rename`, {
      params: { id },
      body: { path: renameModal.path, name: renameModal.name.trim() },
    });
    if (!error) {
      msg.success("重命名成功");
      setRenameModal({ visible: false, path: "", name: "" });
      fetchFiles();
      fetchKb();
      // 如果正在预览被重命名的文件，关闭预览
      if (previewFile === renameModal.path) {
        setPreviewFile(null);
      }
    }
  }, [id, renameModal, previewFile, fetchFiles, fetchKb]);

  // ── 删除文件 ──
  const handleDeleteFile = useCallback(
    async (filePath: string) => {
      if (!id) return;
      const { error } = await client.delete(`/api/ai/knowledge-bases/${id}/files/*`, {
        params: { id, "*": filePath },
      });
      if (!error) {
        msg.success("删除成功");
        fetchFiles();
        fetchKb();
        if (previewFile === filePath) {
          setPreviewFile(null);
        }
      }
    },
    [id, previewFile, fetchFiles, fetchKb],
  );

  // ── 文件列表列定义 ──
  const columns: ColumnsType<FileEntry> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => {
        const isDir = record.type === "directory";
        const isReadme = name.toUpperCase() === "README.MD";
        return (
          <Space
            style={{ cursor: "pointer" }}
            onClick={() => {
              if (isDir) {
                const newPath =
                  currentPath === "." ? name : `${currentPath}/${name}`;
                setCurrentPath(newPath);
              } else {
                handleOpenFile(record.path);
              }
            }}
          >
            {isDir ? (
              <FolderOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
            ) : (
              <FileTextOutlined style={{ color: token.colorTextSecondary, fontSize: 16 }} />
            )}
            <Text style={{ color: isDir ? token.colorPrimary : token.colorText }}>
              {name}
            </Text>
            {isReadme && (
              <Tag icon={<LockOutlined />} color="warning" style={{ marginLeft: 4 }}>
                自动维护
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (size: number, record) =>
        record.type === "directory" ? <Text type="secondary">-</Text> : formatSize(size),
    },
    {
      title: "修改时间",
      dataIndex: "modifiedAt",
      key: "modifiedAt",
      width: 180,
      render: (v: string) => <Text type="secondary">{v ? new Date(v).toLocaleString("zh-CN") : "-"}</Text>,
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      render: (_, record) => {
        const isReadme = record.name.toUpperCase() === "README.MD";
        return (
          <Space size={4}>
            {!isReadme && (
              <Tooltip title="重命名">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameModal({ visible: true, path: record.path, name: record.name });
                  }}
                />
              </Tooltip>
            )}
            {!isReadme && (
              <Popconfirm
                title="确认删除"
                description={`确定删除「${record.name}」？`}
                onConfirm={() => handleDeleteFile(record.path)}
                okText="删除"
                okType="danger"
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  const isReadmePreview = previewFile?.toUpperCase().endsWith("README.MD");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <Card size="small">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate("/app/ai/knowledge-bases")}
            >
              返回
            </Button>
            <FolderOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
            <Title level={5} style={{ margin: 0 }}>
              {kb?.name || "加载中..."}
            </Title>
            {kb?.description && (
              <Text type="secondary" ellipsis style={{ maxWidth: 300 }}>
                {kb.description}
              </Text>
            )}
          </Space>
          {kb && (
            <Space>
              <Tag color="blue">{kb.fileCount} 文件</Tag>
              <Tag color={kb.status === "active" ? "green" : "default"}>
                {kb.status === "active" ? "活跃" : kb.status}
              </Tag>
            </Space>
          )}
        </div>
      </Card>

      {/* 文件浏览器 + 预览 双栏 */}
      <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
        {/* Left: 文件浏览器 */}
        <Card
          style={{ flex: previewFile ? "0 0 50%" : "1 1 100%", transition: "flex 0.2s" }}
          styles={{ body: { padding: 0 } }}
          title={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {/* 面包屑 */}
              <Breadcrumb
                items={[
                  {
                    title: (
                      <a
                        onClick={() => setCurrentPath(".")}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <HomeOutlined /> 根目录
                      </a>
                    ),
                  },
                  ...pathParts.map((part, idx) => {
                    const partPath = pathParts.slice(0, idx + 1).join("/");
                    const isLast = idx === pathParts.length - 1;
                    return {
                      title: isLast ? (
                        <span>{part}</span>
                      ) : (
                        <a onClick={() => setCurrentPath(partPath)}>{part}</a>
                      ),
                    };
                  }),
                ]}
              />

              {/* 操作按钮 */}
              <Space size={4}>
                <Button
                  size="small"
                  icon={<FolderAddOutlined />}
                  onClick={() => setNewDirModal(true)}
                >
                  新建目录
                </Button>
                <Button
                  size="small"
                  icon={<FileAddOutlined />}
                  onClick={() => setNewFileModal(true)}
                >
                  新建文件
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    fetchFiles();
                    fetchKb();
                  }}
                />
              </Space>
            </div>
          }
        >
          <Table
            columns={columns}
            dataSource={files}
            rowKey="path"
            loading={loading}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description="空目录" /> }}
          />
        </Card>

        {/* Right: 文件预览/编辑 */}
        {previewFile && (
          <Card
            style={{ flex: "1 1 50%" }}
            title={
              <Space>
                <FileTextOutlined />
                <Text ellipsis style={{ maxWidth: 240 }}>
                  {previewFile.split("/").pop()}
                </Text>
                {isReadmePreview && (
                  <Tag icon={<LockOutlined />} color="warning">
                    只读
                  </Tag>
                )}
              </Space>
            }
            extra={
              <Space>
                {editing ? (
                  <>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditing(false);
                        setEditContent(previewContent);
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSave}
                    >
                      保存
                    </Button>
                  </>
                ) : (
                  <>
                    {!isReadmePreview && (
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(true)}
                      >
                        编辑
                      </Button>
                    )}
                    <Button
                      size="small"
                      onClick={() => setPreviewFile(null)}
                    >
                      关闭
                    </Button>
                  </>
                )}
              </Space>
            }
            styles={{ body: { padding: editing ? 0 : 16 } }}
          >
            {previewLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <Spin />
              </div>
            ) : editing ? (
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoSize={{ minRows: 20 }}
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: "none",
                  borderRadius: 0,
                  resize: "none",
                }}
              />
            ) : (
              <MarkdownPreview content={previewContent} />
            )}
          </Card>
        )}
      </div>

      {/* 新建目录 Modal */}
      <Modal
        title="新建目录"
        open={newDirModal}
        onOk={handleCreateDir}
        onCancel={() => {
          setNewDirModal(false);
          setNewDirName("");
        }}
        okText="创建"
      >
        <Input
          placeholder="请输入目录名称"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={handleCreateDir}
        />
      </Modal>

      {/* 新建文件 Modal */}
      <Modal
        title="新建文件"
        open={newFileModal}
        onOk={handleCreateFile}
        onCancel={() => {
          setNewFileModal(false);
          setNewFileName("");
        }}
        okText="创建"
      >
        <Input
          placeholder="请输入文件名称（自动添加 .md 后缀）"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={handleCreateFile}
          addonAfter=".md"
        />
      </Modal>

      {/* 重命名 Modal */}
      <Modal
        title="重命名"
        open={renameModal.visible}
        onOk={handleRename}
        onCancel={() => setRenameModal({ visible: false, path: "", name: "" })}
        okText="确认"
      >
        <Input
          placeholder="请输入新名称"
          value={renameModal.name}
          onChange={(e) => setRenameModal((prev) => ({ ...prev, name: e.target.value }))}
          onPressEnter={handleRename}
        />
      </Modal>
    </div>
  );
}

/** 简易 Markdown 预览 */
function MarkdownPreview({ content }: { content: string }) {
  const { token } = theme.useToken();
  const lines = content.split("\n");

  return (
    <div style={{ fontSize: 14, lineHeight: 1.8, color: token.colorText }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;

        // 标题
        if (line.startsWith("# ")) {
          return (
            <div key={i} style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, marginTop: 16 }}>
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <div key={i} style={{ fontSize: 20, fontWeight: 600, marginBottom: 6, marginTop: 14 }}>
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <div key={i} style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 12 }}>
              {line.slice(4)}
            </div>
          );
        }

        // 引用
        if (line.startsWith("> ")) {
          return (
            <div
              key={i}
              style={{
                paddingLeft: 12,
                borderLeft: `3px solid ${token.colorPrimary}`,
                color: token.colorTextSecondary,
                fontStyle: "italic",
                marginBottom: 4,
              }}
            >
              {line.slice(2)}
            </div>
          );
        }

        // 分隔线
        if (line.trim() === "---") {
          return (
            <div
              key={i}
              style={{
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                margin: "12px 0",
              }}
            />
          );
        }

        // 无序列表
        if (line.match(/^\s*[-*]\s/)) {
          const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
          const text = line.replace(/^\s*[-*]\s/, "");
          return (
            <div
              key={i}
              style={{ display: "flex", gap: 8, paddingLeft: indent * 8, marginBottom: 2 }}
            >
              <span style={{ color: token.colorPrimary, flexShrink: 0 }}>•</span>
              <span>{renderInlineMarkdown(text)}</span>
            </div>
          );
        }

        // 普通文本
        return (
          <div key={i} style={{ marginBottom: 2 }}>
            {renderInlineMarkdown(line)}
          </div>
        );
      })}
    </div>
  );
}

/** 行内 Markdown 渲染（加粗、链接、代码） */
function renderInlineMarkdown(text: string): React.ReactNode {
  // 简单处理: **bold**, `code`, [link](url)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "rgba(0,0,0,0.06)",
            padding: "1px 4px",
            borderRadius: 4,
            fontSize: "0.9em",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} style={{ color: "#1677ff" }}>
          {linkMatch[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
