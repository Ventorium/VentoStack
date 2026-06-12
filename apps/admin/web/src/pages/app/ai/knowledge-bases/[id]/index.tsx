import { client } from "@/api";
import type { KnowledgeBaseItem, FileEntry } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import MilkdownEditor from "@/components/MilkdownEditor";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileAddOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOutlined,
  HomeOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Progress,
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

const { Text } = Typography;

/** 格式化文件大小 */
function formatSize(size: number): string {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** 判断是否为需要转码的文档类型 */
function needsConversion(name: string): boolean {
  return /\.(docx?|pdf|pptx?|xlsx?)$/i.test(name);
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
  const [hasSourceFile, setHasSourceFile] = useState(false);

  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [convertingFiles, setConvertingFiles] = useState<Set<string>>(new Set());
  const fileInputRef = useState<HTMLInputElement | null>(null);

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
      setHasSourceFile(false);
      try {
        // Issue #2 fix: 正确传递文件路径
        const { error, data } = (await client.get("/api/ai/knowledge-bases/:id/files/*", {
          params: { id, "*": filePath },
        })) as { error?: unknown; data?: { content: string; title: string } };
        if (!error && data) {
          setPreviewContent(data.content);
          setEditContent(data.content);
          // Issue #3: 记录是否有源文件
          setHasSourceFile(!!data.sourcePath);
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [id],
  );

  // ── 检查源文件是否存在 ──
  const checkSourceFile = useCallback(
    async (filePath: string) => {
      if (!id || !filePath) { setHasSourceFile(false); return; }
      try {
        const sourceName = filePath.split("/").pop()?.replace(/\.md$/, "");
        if (!sourceName) { setHasSourceFile(false); return; }
        const resp = await fetch(`/api/ai/knowledge-bases/${id}/source/${sourceName}`, { method: "HEAD", credentials: "include" });
        setHasSourceFile(resp.ok);
      } catch {
        setHasSourceFile(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (previewFile && !editing) {
      checkSourceFile(previewFile);
    }
  }, [previewFile, editing, checkSourceFile]);

  // ── 保存文件 ──
  const handleSave = useCallback(async () => {
    if (!id || !previewFile) return;
    setSaving(true);
    try {
      const { error } = (await client.put("/api/ai/knowledge-bases/:id/files/*", {
        params: { id, "*": previewFile },
        body: { content: editContent },
      })) as { error?: unknown };
      if (!error) {
        msg.success("保存成功");
        setPreviewContent(editContent);
        setEditing(false);
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
    const dirPath = currentPath === "." ? newDirName : `${currentPath}/${newDirName}`;
    const { error } = (await client.post("/api/ai/knowledge-bases/:id/mkdir", {
      params: { id },
      body: { path: dirPath },
    })) as { error?: unknown };
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
    const fileName = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    const filePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;
    const { error } = (await client.put("/api/ai/knowledge-bases/:id/files/*", {
      params: { id, "*": filePath },
      body: { content: `# ${newFileName}\n\n` },
    })) as { error?: unknown };
    if (!error) {
      msg.success("文件创建成功");
      setNewFileModal(false);
      setNewFileName("");
      fetchFiles();
    }
  }, [id, newFileName, currentPath, fetchFiles]);

  // ── 删除文件/目录 ──
  const handleDelete = useCallback(
    async (filePath: string) => {
      if (!id) return;
      const { error } = (await client.delete("/api/ai/knowledge-bases/:id/files/*", {
        params: { id, "*": filePath },
      })) as { error?: unknown };
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

  // ── 重命名 ──
  const handleRename = useCallback(async () => {
    if (!id || !renameModal.path || !renameModal.name.trim()) return;
    const { error } = (await client.post("/api/ai/knowledge-bases/:id/rename", {
      params: { id },
      body: { path: renameModal.path, newName: renameModal.name },
    })) as { error?: unknown };
    if (!error) {
      msg.success("重命名成功");
      setRenameModal({ visible: false, path: "", name: "" });
      fetchFiles();
    }
  }, [id, renameModal, fetchFiles]);

  // ── 文件上传 (Issue #4 & #5 修复) ──
  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!id || !fileList || fileList.length === 0) return;
      setUploading(true);
      const converting = new Set<string>();
      try {
        for (const file of Array.from(fileList)) {
          // Issue #5: 需要转码的文件显示处理中状态
          if (needsConversion(file.name)) {
            converting.add(file.name);
            setConvertingFiles(new Set(converting));
          }

          const formData = new FormData();
          formData.append("file", file);
          if (currentPath !== ".") formData.append("dir", currentPath);

          const { error } = (await client.post(`/api/ai/knowledge-bases/${id}/upload`, {
            body: formData,
          })) as { error?: unknown };
          if (error) {
            msg.error(`上传失败: ${file.name}`);
          } else {
            msg.success(`上传成功: ${file.name}`);
          }
          converting.delete(file.name);
          setConvertingFiles(new Set(converting));
        }
        // Issue #4 fix: 上传后重新加载文件列表
        await fetchFiles();
        await fetchKb();
      } finally {
        setUploading(false);
        setConvertingFiles(new Set());
      }
    },
    [id, currentPath, fetchFiles, fetchKb],
  );

  // ── 下载源文件 (Issue #6 修复) ──
  const handleDownloadSource = useCallback(async () => {
    if (!id || !previewFile) return;
    const sourceName = previewFile.split("/").pop()?.replace(/\.md$/, "");
    if (!sourceName) return;
    try {
      const resp = await fetch(`/api/ai/knowledge-bases/${id}/source/${sourceName}`, {
        credentials: "include",
      });
      if (!resp.ok) {
        msg.error("源文件不存在或已被删除");
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = sourceName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      msg.error("下载失败");
    }
  }, [id, previewFile]);

  // ── 拖拽处理 ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  // ── 渲染 ──
  const isReadmePreview = previewFile?.endsWith("README.md") || previewFile?.endsWith("readme.md");

  return (
    <div style={{ padding: 24 }}>
      {/* Issue #1 fix: 导航使用 replace 而非 push，避免改变路由层级导致菜单收起 */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/app/ai/knowledge-bases")}>
          返回
        </Button>
        <div style={{ flex: 1 }}>
          <Breadcrumb
            items={[
              { title: <HomeOutlined />, onClick: () => setCurrentPath(".") },
              ...pathParts.map((part, i) => ({
                title: part,
                onClick: () => setCurrentPath(pathParts.slice(0, i + 1).join("/")),
              })),
            ]}
          />
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchFiles} loading={loading}>
            刷新
          </Button>
          <Button icon={<FolderAddOutlined />} onClick={() => setNewDirModal(true)}>
            新建目录
          </Button>
          <Button icon={<FileAddOutlined />} onClick={() => setNewFileModal(true)}>
            新建文件
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ".md,.txt,.docx,.doc,.pdf,.xlsx,.pptx";
              input.onchange = (e) => handleUpload((e.target as HTMLInputElement).files);
              input.click();
            }}
            loading={uploading}
          >
            上传文件
          </Button>
        </Space>
      </div>

      {/* 知识库信息 */}
      {kb && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <Text strong style={{ fontSize: 16 }}>{kb.name}</Text>
              {kb.description && (
                <Text type="secondary" style={{ marginLeft: 12 }}>{kb.description}</Text>
              )}
            </div>
            <Space>
              <Tag>{kb.fileCount ?? 0} 个文件</Tag>
              <Tag color={kb.scope === "global" ? "blue" : kb.scope === "personal" ? "green" : "orange"}>
                {kb.scope === "global" ? "全局" : kb.scope === "personal" ? "个人" : "部门"}
              </Tag>
            </Space>
          </div>
        </Card>
      )}

      {/* 转码进度提示 (Issue #5) */}
      {convertingFiles.size > 0 && (
        <Card size="small" style={{ marginBottom: 16, borderColor: token.colorWarning }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LoadingOutlined style={{ color: token.colorWarning }} />
            <Text>正在转码文档，请稍候...</Text>
          </div>
          {[...convertingFiles].map((name) => (
            <div key={name} style={{ marginTop: 4, paddingLeft: 24 }}>
              <Text type="secondary">{name}</Text>
            </div>
          ))}
        </Card>
      )}

      {/* 拖拽上传遮罩 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: "relative" }}
      >
        {isDragOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: token.borderRadius,
            }}
          >
            <div style={{ color: "#fff", fontSize: 20, textAlign: "center" }}>
              <UploadOutlined style={{ fontSize: 48, display: "block", marginBottom: 12 }} />
              拖拽文件到此处上传
            </div>
          </div>
        )}

        {/* 文件列表 + 预览 */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: previewFile ? "0 0 40%" : "1 1 100%" }}>
            <Card
              size="small"
              title={
                <Space>
                  <FolderOutlined />
                  <span>{currentPath === "." ? "根目录" : currentPath}</span>
                </Space>
              }
            >
              <Spin spinning={loading}>
                {files.length === 0 ? (
                  <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <Table<FileEntry>
                    dataSource={files}
                    rowKey="path"
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: "名称",
                        dataIndex: "name",
                        key: "name",
                        render: (name: string, record: FileEntry) => (
                          <div
                            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                            onClick={() => {
                              if (record.type === "directory") {
                                setCurrentPath(record.path);
                              } else {
                                handleOpenFile(record.path);
                              }
                            }}
                          >
                            {record.type === "directory" ? (
                              <FolderOutlined style={{ color: token.colorPrimary }} />
                            ) : (
                              <FileTextOutlined style={{ color: token.colorTextSecondary }} />
                            )}
                            <Text ellipsis>{name}</Text>
                          </div>
                        ),
                      },
                      {
                        title: "大小",
                        dataIndex: "size",
                        key: "size",
                        width: 100,
                        render: (size: number, record: FileEntry) =>
                          record.type === "directory" ? "-" : formatSize(size),
                      },
                      {
                        title: "",
                        key: "actions",
                        width: 60,
                        render: (_: unknown, record: FileEntry) => (
                          <Space size={4}>
                            <Popconfirm
                              title="确认删除？"
                              onConfirm={() => handleDelete(record.path)}
                            >
                              <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                              </Tooltip>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </Spin>
            </Card>
          </div>

          {/* 文件预览/编辑面板 */}
          {previewFile && (
            <div style={{ flex: "1 1 60%" }}>
              <Card
                size="small"
                title={
                  <Space>
                    <FileOutlined />
                    <Text ellipsis style={{ maxWidth: 300 }}>{previewFile.split("/").pop()}</Text>
                  </Space>
                }
                extra={
                  <Space size={4}>
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
                        {/* Issue #3 & #6: 仅在有源文件时显示下载按钮 */}
                        {hasSourceFile && (
                          <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadSource}
                          >
                            下载源文件
                          </Button>
                        )}
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
              >
                {previewLoading ? (
                  <div style={{ textAlign: "center", padding: 40 }}>
                    <Spin />
                  </div>
                ) : editing ? (
                  /* Issue #7: Milkdown 编辑器 */
                  <MilkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="编辑 Markdown 内容..."
                  />
                ) : (
                  <MarkdownPreview content={previewContent} />
                )}
              </Card>
            </div>
          )}
        </div>
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
        if (line.startsWith("# ")) return <div key={i} style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, marginTop: 16 }}>{line.slice(2)}</div>;
        if (line.startsWith("## ")) return <div key={i} style={{ fontSize: 20, fontWeight: 600, marginBottom: 6, marginTop: 14 }}>{line.slice(3)}</div>;
        if (line.startsWith("### ")) return <div key={i} style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 12 }}>{line.slice(4)}</div>;
        if (line.startsWith("> ")) return <div key={i} style={{ paddingLeft: 12, borderLeft: `3px solid ${token.colorPrimary}`, color: token.colorTextSecondary, fontStyle: "italic", marginBottom: 4 }}>{line.slice(2)}</div>;
        if (line.trim() === "---") return <div key={i} style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, margin: "12px 0" }} />;
        if (line.match(/^\s*[-*]\s/)) {
          const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
          const text = line.replace(/^\s*[-*]\s/, "");
          return <div key={i} style={{ display: "flex", gap: 8, paddingLeft: indent * 8, marginBottom: 2 }}><span style={{ color: token.colorPrimary, flexShrink: 0 }}>•</span><span>{renderInlineMarkdown(text)}</span></div>;
        }
        return <div key={i} style={{ marginBottom: 2 }}>{renderInlineMarkdown(line)}</div>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 4, fontSize: "0.9em" }}>{part.slice(1, -1)}</code>;
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) return <a key={i} href={linkMatch[2]} style={{ color: "#1677ff" }}>{linkMatch[1]}</a>;
    return <span key={i}>{part}</span>;
  });
}
