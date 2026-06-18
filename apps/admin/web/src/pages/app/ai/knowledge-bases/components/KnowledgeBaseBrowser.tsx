/**
 * 知识库文件浏览器组件
 * 左侧文件目录 + 右侧文件内容
 */
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
  FileTextOutlined,
  FolderAddOutlined,
  FolderOutlined,
  FormOutlined,
  HomeOutlined,
  LoadingOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Breadcrumb,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  theme,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import MarkdownPreview from "@/components/MarkdownPreview";
import { useCallback, useEffect, useMemo, useState } from "react";

const { Text } = Typography;

// Milkdown Crepe 默认字号偏大，在知识库上下文中缩小 2 号，并贴合 Ant Design 风格
const kbEditorStyle = document.createElement("style");
kbEditorStyle.textContent = `
  .kb-editor-wrap .milkdown { font-size: 14px !important; color: #e5e7eb !important; }
  .kb-editor-wrap .milkdown .editor { font-size: 14px !important; line-height: 1.7 !important; padding: 12px 16px !important; }
  .kb-editor-wrap .milkdown h1 { font-size: 22px !important; color: #f3f4f6 !important; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; }
  .kb-editor-wrap .milkdown h2 { font-size: 18px !important; color: #f3f4f6 !important; }
  .kb-editor-wrap .milkdown h3 { font-size: 16px !important; color: #f3f4f6 !important; }
  .kb-editor-wrap .milkdown code { background: rgba(255,255,255,0.06) !important; border-radius: 4px; padding: 1px 5px; font-size: 13px !important; }
  .kb-editor-wrap .milkdown pre { background: rgba(0,0,0,0.3) !important; border-radius: 8px; padding: 12px 16px; }
  .kb-editor-wrap .milkdown pre code { background: transparent !important; padding: 0; }
  .kb-editor-wrap .milkdown blockquote { border-left: 3px solid #ff7a1a !important; color: #9ca3af !important; padding-left: 12px; }
  .kb-editor-wrap .milkdown a { color: #60a5fa !important; }
  .kb-editor-wrap .milkdown table { border-collapse: collapse; width: 100%; }
  .kb-editor-wrap .milkdown table th { background: rgba(255,255,255,0.04); font-weight: 600; text-align: left; }
  .kb-editor-wrap .milkdown table th, .kb-editor-wrap .milkdown table td { border: 1px solid rgba(255,255,255,0.08); padding: 6px 12px; }
  .kb-editor-wrap .milkdown hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0; }
  .kb-editor-wrap .milkdown ul, .kb-editor-wrap .milkdown ol { padding-left: 20px; }
  .kb-editor-wrap .milkdown li { margin: 2px 0; }
  .kb-editor-wrap .milkdown img { max-width: 100%; border-radius: 8px; }
  .kb-editor-wrap .ProseMirror { outline: none !important; }
  .kb-editor-wrap .ProseMirror-focused { outline: none !important; }
`;
// hover 时才显示文件行操作按钮
const kbFileRowStyle = document.createElement("style");
kbFileRowStyle.textContent = `
  .kb-file-row-actions { opacity: 0; transition: opacity 0.15s; display: flex; gap: 2px; align-items: center; }
  tr:hover .kb-file-row-actions { opacity: 1; }
`;
if (!document.getElementById("kb-file-row-hover")) {
  kbFileRowStyle.id = "kb-file-row-hover";
  document.head.appendChild(kbFileRowStyle);
}

if (!document.getElementById("kb-editor-font-fix")) {
  kbEditorStyle.id = "kb-editor-font-fix";
  document.head.appendChild(kbEditorStyle);
}

function formatSize(size: number): string {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function needsConversion(name: string): boolean {
  return /\.(docx?|pdf|pptx?|xlsx?)$/i.test(name);
}

function isReadme(filePath: string): boolean {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  return name === "readme.md" || name === "readme.txt";
}

interface Props {
  kbId: string;
  onBreadcrumb?: (items: React.ReactNode) => void;
}

export default function KnowledgeBaseBrowser({ kbId, onBreadcrumb }: Props) {
  const { token } = theme.useToken();

  const [kb, setKb] = useState<KnowledgeBaseItem | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(".");

  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hasSourceFile, setHasSourceFile] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [convertingFiles, setConvertingFiles] = useState<Set<string>>(new Set());

  const [newDirModal, setNewDirModal] = useState(false);
  const [newDirName, setNewDirName] = useState("");
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [renameModal, setRenameModal] = useState<{ visible: boolean; path: string; name: string; ext: string }>({
    visible: false, path: "", name: "", ext: "",
  });
  const [unsavedModal, setUnsavedModal] = useState<{ visible: boolean; pendingAction: (() => void) | null }>({
    visible: false, pendingAction: null,
  });

  const pathParts = useMemo(() => {
    if (currentPath === "." || currentPath === "") return [];
    return currentPath.split("/").filter(Boolean);
  }, [currentPath]);


  const fetchKb = useCallback(async () => {
    const { error, data } = (await client.get("/api/ai/knowledge-bases/:id", {
      params: { id: kbId },
    })) as { error?: unknown; data?: KnowledgeBaseItem };
    if (!error) setKb(data ?? null);
  }, [kbId]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get("/api/ai/knowledge-bases/:id/files", {
        params: { id: kbId },
        query: { path: currentPath, depth: 1 },
      })) as { error?: unknown; data?: FileEntry[] };
      if (!error) setFiles(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [kbId, currentPath]);

  useEffect(() => { fetchKb(); }, [fetchKb]);
  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── 导航守卫：编辑态切换文件/目录时提示保存 ──
  const tryNavigate = useCallback((action: () => void) => {
    if (editing) {
      setUnsavedModal({ visible: true, pendingAction: action });
    } else {
      action();
    }
  }, [editing]);


  // ── 返回上级目录 ──
  const navigateToParent = useCallback(() => {
    if (pathParts.length <= 1) { setCurrentPath("."); return; }
    setCurrentPath(pathParts.slice(0, -1).join("/"));
  }, [pathParts]);

  // ── 重命名 ──
  const handleRename = useCallback(async () => {
    if (!renameModal.name.trim()) return;
    const finalName = renameModal.ext ? `${renameModal.name}.${renameModal.ext}` : renameModal.name;
    const { error } = (await client.post("/api/ai/knowledge-bases/:id/rename", {
      params: { id: kbId },
      body: { path: renameModal.path, name: finalName },
    })) as { error?: unknown };
    if (!error) {
      msg.success("重命名成功");
      setRenameModal({ visible: false, path: "", name: "", ext: "" });
      fetchFiles();
      fetchKb();
    }
  }, [kbId, renameModal, fetchFiles, fetchKb]);

  // ── 面包屑 ──
  const breadcrumb = (
    <Breadcrumb
      items={[
        {
          title: (
            <a onClick={() => tryNavigate(() => setCurrentPath("."))}>
              <HomeOutlined /> {kb?.name || "知识库"}
            </a>
          ),
        },
        ...pathParts.map((part, i) => {
          const partPath = pathParts.slice(0, i + 1).join("/");
          const isLast = i === pathParts.length - 1;
          return {
            title: isLast
              ? <span>{part}</span>
              : <a onClick={() => setCurrentPath(partPath)}>{part}</a>,
          };
        }),
      ]}
    />
  );

  useEffect(() => { onBreadcrumb?.(breadcrumb); }, [currentPath, kb?.name, pathParts]);

  // ── 打开文件 ──
  const handleOpenFile = useCallback(async (filePath: string) => {
    setPreviewLoading(true);
    setPreviewFile(filePath);
    setEditing(false);
    setHasSourceFile(false);
    try {
      const { error, data } = (await client.get(`/api/ai/knowledge-bases/${kbId}/files/${filePath}`)) as {
        error?: unknown; data?: { content: string; title: string; sourcePath?: string };
      };
      if (!error && data) {
        setPreviewContent(data.content);
        setEditContent(data.content);
        setHasSourceFile(!!data.sourcePath);
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [kbId]);

  // ── 保存文件 ──
  const handleSaveFile = useCallback(async () => {
    if (!previewFile) return;
    setSaving(true);
    try {
      const { error } = (await client.put(`/api/ai/knowledge-bases/${kbId}/files/${previewFile}`, {
        body: { content: editContent },
      })) as { error?: unknown };
      if (!error) {
        msg.success("保存成功");
        setEditing(false);
        setPreviewContent(editContent);
        fetchFiles();
        fetchKb();
      }
    } finally { setSaving(false); }
  }, [kbId, previewFile, editContent, fetchFiles, fetchKb]);

  const handleUnsavedSave = useCallback(async () => {
    await handleSaveFile();
    unsavedModal.pendingAction?.();
    setUnsavedModal({ visible: false, pendingAction: null });
  }, [unsavedModal.pendingAction, handleSaveFile]);

  const handleUnsavedDiscard = useCallback(() => {
    unsavedModal.pendingAction?.();
    setUnsavedModal({ visible: false, pendingAction: null });
    setEditing(false);
  }, [unsavedModal.pendingAction]);

  // ── 新建目录 ──
  const handleCreateDir = useCallback(async () => {
    if (!newDirName.trim()) return;
    const dirPath = currentPath === "." ? newDirName : `${currentPath}/${newDirName}`;
    const { error } = (await client.put(`/api/ai/knowledge-bases/${kbId}/files/${dirPath}`, {
      body: { content: "" },
    })) as { error?: unknown };
    if (!error) { msg.success("目录创建成功"); setNewDirModal(false); setNewDirName(""); fetchFiles(); }
  }, [kbId, newDirName, currentPath, fetchFiles]);

  // ── 新建文件 ──
  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) return;
    const fileName = newFileName.endsWith(".md") ? newFileName : `${newFileName}.md`;
    const filePath = currentPath === "." ? fileName : `${currentPath}/${fileName}`;
    const { error } = (await client.put(`/api/ai/knowledge-bases/${kbId}/files/${filePath}`, {
      body: { content: `# ${newFileName}\n\n` },
    })) as { error?: unknown };
    if (!error) { msg.success("文件创建成功"); setNewFileModal(false); setNewFileName(""); fetchFiles(); }
  }, [kbId, newFileName, currentPath, fetchFiles]);

  // ── 删除文件 ──
  const handleDeleteFile = useCallback(async (filePath: string) => {
    // 先清除预览，避免删除后有残留请求
    if (previewFile === filePath) { setPreviewFile(null); setEditing(false); }
    const { error } = (await client.delete(`/api/ai/knowledge-bases/${kbId}/files/${filePath}`)) as { error?: unknown };
    if (!error) {
      msg.success("删除成功");
      fetchFiles();
      fetchKb();
    }
  }, [kbId, previewFile, fetchFiles, fetchKb]);

  // ── 上传 ──
  const handleUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const converting = new Set<string>();
    try {
      for (const file of Array.from(fileList)) {
        if (needsConversion(file.name)) { converting.add(file.name); setConvertingFiles(new Set(converting)); }
        const formData = new FormData();
        formData.append("file", file);
        if (currentPath !== ".") formData.append("dir", currentPath);
        const { error } = (await client.post(`/api/ai/knowledge-bases/${kbId}/upload`, { body: formData })) as { error?: unknown };
        if (error) msg.error(`上传失败: ${file.name}`);
        else msg.success(`上传成功: ${file.name}`);
        converting.delete(file.name);
        setConvertingFiles(new Set(converting));
      }
      await fetchFiles();
      await fetchKb();
    } finally { setUploading(false); setConvertingFiles(new Set()); }
  }, [kbId, currentPath, fetchFiles, fetchKb]);

  // ── 下载源文件 ──
  const handleDownloadSource = useCallback(async () => {
    if (!previewFile) return;
    const sourceName = previewFile.split("/").pop()?.replace(/\.md$/, "");
    if (!sourceName) return;
    try {
      const resp = await fetch(`/api/ai/knowledge-bases/${kbId}/source/${sourceName}`, { credentials: "include" });
      if (!resp.ok) { msg.error("源文件不存在"); return; }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = sourceName;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { msg.error("下载失败"); }
  }, [kbId, previewFile]);

  // ── 文件表格列 ──
  const fileColumns: ColumnsType<FileEntry> = [
    {
      title: "名称", dataIndex: "name", key: "name",
      render: (name: string, record: FileEntry) => (
        <div className="flex items-center gap-1.5">
          {record.type === "directory"
            ? <FolderOutlined className="text-blue-500 text-sm" />
            : <FileTextOutlined className="text-gray-400 text-sm" />}
          <Text ellipsis className="text-sm flex-1">{name}</Text>
          {isReadme(record.path) && <LockOutlined className="text-xs text-gray-300" />}
          {convertingFiles.has(name) && <Tag color="processing" className="text-xs"><LoadingOutlined /> 转换中</Tag>}
        </div>
      ),
    },
    {
      title: "大小", dataIndex: "size", key: "size", width: 72, align: "right",
      render: (v: number, r) => r.type === "directory"
        ? <Text type="secondary">-</Text>
        : <Text type="secondary" className="text-xs">{formatSize(v)}</Text>,
    },
    {
      title: "", key: "action", width: 72,
      render: (_, record) => {
        if (isReadme(record.path)) return null;
        return (
          <div className="kb-file-row-actions">
            <Button type="text" size="small" icon={<FormOutlined />}
              onClick={(e) => { e.stopPropagation(); setRenameModal({ visible: true, path: record.path, name: record.name.replace(/\.[^.]+$/, ""), ext: record.name.includes(".") ? record.name.split(".").pop()! : "" }); }} />
            <Popconfirm title="确定删除？" onConfirm={() => handleDeleteFile(record.path)} onCancel={(e) => e?.stopPropagation()}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  const isReadmePreview = previewFile ? isReadme(previewFile) : false;

  return (
    <div className="flex h-full">
      {/* ── 左侧：文件目录 ── */}
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden relative w-[360px]"
         style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleUpload(e.dataTransfer.files); }}
      >
        {/* 工具栏 */}
        <div className="flex items-center gap-1 px-3 py-2" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Button size="small" icon={<ArrowLeftOutlined />} disabled={currentPath === "."} onClick={() => tryNavigate(navigateToParent)} />
          <Button size="small" icon={<FolderAddOutlined />} onClick={() => setNewDirModal(true)} />
          <Button size="small" icon={<FileAddOutlined />} onClick={() => setNewFileModal(true)} />
          <Button size="small" icon={<UploadOutlined />} loading={uploading} onClick={() => {
            const input = document.createElement("input");
            input.type = "file"; input.multiple = true;
            input.accept = ".md,.txt,.pdf,.docx,.doc,.pptx,.xlsx";
            input.onchange = (e) => handleUpload((e.target as HTMLInputElement).files);
            input.click();
          }} />
          <div className="flex-1" />
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchFiles} />
        </div>

        {/* 拖拽提示 */}
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-blue-500 pointer-events-none"
            style={{ background: "rgba(22,119,255,0.08)", border: `2px dashed ${token.colorPrimary}`, borderRadius: token.borderRadius }}>
            <UploadOutlined className="mr-2" /> 拖拽上传
          </div>
        )}

        {/* 文件列表 */}
        <div className="flex-1 overflow-auto">
          <Table
            rowKey="path"
            columns={fileColumns}
            dataSource={files.map(({ children: _c, ...rest }) => rest) as FileEntry[]}
            loading={loading}
            size="small"
            pagination={false}
            showHeader={false}
            onRow={(record) => ({
              onClick: () => record.type === "directory" ? tryNavigate(() => setCurrentPath(record.path)) : tryNavigate(() => handleOpenFile(record.path)),
              style: record.path === previewFile
                ? { background: token.controlItemBgActive, cursor: "pointer" }
                : { cursor: "pointer" },
            })}
            locale={{ emptyText: <Empty description="空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-6" /> }}
          />
        </div>
      </div>

      {/* ── 右侧：文件内容 ── */}
      <div className="flex-1 overflow-auto" style={{ background: token.colorBgContainer }}>
        {!previewFile ? (
          <div className="flex items-center justify-center h-full text-gray-300">
            <Empty description="选择文件查看内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div className="p-4">
            {/* 文件标题栏 */}
            <div className="flex items-center justify-between pb-3 mb-3" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Space>
                <FileTextOutlined />
                <Text strong>{previewFile.split("/").pop()}</Text>
                {isReadmePreview && <Tag icon={<LockOutlined />} color="default">自动生成</Tag>}
                {editing && <Tag color="orange">编辑中</Tag>}
              </Space>
              <Space size={4}>
                {hasSourceFile && (
                  <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadSource}>查看源文件</Button>
                )}
                {editing ? (
                  <>
                    <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveFile}>保存</Button>
                    <Button size="small" onClick={() => { setEditing(false); setEditContent(previewContent); }}>取消</Button>
                  </>
                ) : (
                  <>
                    {!isReadmePreview && (
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑</Button>
                    )}
                    <Button size="small" onClick={() => setPreviewFile(null)}>关闭</Button>
                  </>
                )}
              </Space>
            </div>

            {/* 内容区 */}
            {previewLoading ? (
              <div className="text-center py-15"><Spin /></div>
            ) : editing ? (
              <div className="kb-editor-wrap">
                <MilkdownEditor value={editContent} onChange={setEditContent} placeholder="编辑 Markdown 内容..." />
              </div>
            ) : (
              <MarkdownPreview content={previewContent} />
            )}
          </div>
        )}
      </div>

      {/* 新建目录 Modal */}
      <Modal title="新建目录" open={newDirModal} onOk={handleCreateDir}
        onCancel={() => { setNewDirModal(false); setNewDirName(""); }} okText="创建">
        <Input placeholder="请输入目录名称" value={newDirName} onChange={(e) => setNewDirName(e.target.value)} onPressEnter={handleCreateDir} />
      </Modal>

      {/* 新建文件 Modal */}
      <Modal title="新建文件" open={newFileModal} onOk={handleCreateFile}
        onCancel={() => { setNewFileModal(false); setNewFileName(""); }} okText="创建">
        <Input placeholder="请输入文件名称" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} onPressEnter={handleCreateFile} addonAfter=".md" />
      </Modal>

      {/* 重命名 Modal */}
      <Modal title="重命名" open={renameModal.visible} onOk={handleRename}
        onCancel={() => setRenameModal({ visible: false, path: "", name: "", ext: "" })} okText="确定">
        <Input placeholder="请输入新名称" value={renameModal.name}
          onChange={(e) => setRenameModal((prev) => ({ ...prev, name: e.target.value }))}
          onPressEnter={handleRename}
          addonAfter={renameModal.ext ? `.${renameModal.ext}` : undefined} />
      </Modal>

      {/* 未保存提示 Modal */}
      <Modal
        title="未保存的更改"
        open={unsavedModal.visible}
        onCancel={() => setUnsavedModal({ visible: false, pendingAction: null })}
        footer={
          <Space>
            <Button onClick={() => setUnsavedModal({ visible: false, pendingAction: null })}>取消</Button>
            <Button danger onClick={handleUnsavedDiscard}>不保存</Button>
            <Button type="primary" onClick={handleUnsavedSave}>保存</Button>
          </Space>
        }
      >
        <p>当前文件正在编辑中，是否保存更改？</p>
      </Modal>
    </div>
  );
}
