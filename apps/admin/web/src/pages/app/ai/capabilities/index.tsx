/**
 * AI 智能能力管理页面
 * Tabs: 技能 (Skills) | MCP 服务 | 工具 (Tools)
 */
import { client } from "@/api";
import type { SkillItem, McpServerItem, AIToolItem, StoreSkillItem, PaginatedData } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import {
  ApiOutlined,
  AppstoreOutlined,
  BlockOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  FolderOutlined,
  HomeOutlined,
  InboxOutlined,
  FunctionOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  StarFilled,
  ThunderboltOutlined,
  ToolOutlined,
  FileTextOutlined,
  UploadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import ActionColumn from "@/components/ActionColumn";
import MilkdownEditor from "@/components/MilkdownEditor";
import MarkdownPreview from "@/components/MarkdownPreview";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/utils/fmtDate";
import { useNavigate } from "react-router-dom";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

// ─────────────────────────────────────────
// 技能 (Skills) Tab
// ─────────────────────────────────────────

function SkillsTab() {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [installed, setInstalled] = useState<SkillItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeResults, setStoreResults] = useState<StoreSkillItem[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storePage, setStorePage] = useState(1);
  const [storeHasMore, setStoreHasMore] = useState(false);
  const [mode, setMode] = useState<"installed" | "store">("installed");

  // 详情抽屉
  const [fileDrawerOpen, setFileDrawerOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [fileTree, setFileTree] = useState<Array<{ path: string; size: number }>>([]);
  const [skillFilePath, setSkillFilePath] = useState(".");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentPath, setFileContentPath] = useState("");
  const [editingFile, setEditingFile] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [savingFile, setSavingFile] = useState(false);

  // 上传 Modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm] = Form.useForm();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data } = (await client.get("/api/ai/skills", {
        query: { page, pageSize: 20 },
      })) as { error?: unknown; data?: PaginatedData<SkillItem> };
      if (!error && data) {
        setInstalled(data.list);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { refresh(); }, [refresh]);

  // 已安装 slug 集合，用于商店列表标记
  const installedSlugs = useMemo(() => new Set(installed.map(s => s.slug)), [installed]);
  const installedMap = useMemo(() => new Map(installed.map(s => [s.slug, s])), [installed]);

  const searchStore = useCallback(async (keyword?: string, p?: number) => {
    const q = keyword ?? storeSearch;
    const pg = p ?? 1;
    if (!q.trim()) return;
    setStoreLoading(true);
    try {
      const { error, data } = (await client.get("/api/ai/skills/store/search", {
        query: { keyword: q, page: pg, pageSize: 12 },
      })) as { error?: unknown; data?: { skills: StoreSkillItem[]; hasMore: boolean } };
      if (!error && data) {
        if (pg === 1) setStoreResults(data.skills);
        else setStoreResults(prev => [...prev, ...data.skills]);
        setStoreHasMore(data.hasMore);
        setStorePage(pg);
      }
    } finally {
      setStoreLoading(false);
    }
  }, [storeSearch]);

  const installFromStore = useCallback(async (slug: string) => {
    setInstallingSlug(slug);
    try {
      const { error } = (await client.post(`/api/ai/skills/store/${slug}/install`, {
        body: {},
      })) as { error?: unknown };
      if (!error) {
        msg.success("安装成功");
        refresh();
      }
    } catch {
      msg.error("安装失败");
    } finally {
      setInstallingSlug(null);
    }
  }, [refresh]);

  const toggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    await client.put("/api/ai/skills/:id", { params: { id }, body: { enabled } });
    refresh();
  }, [refresh]);

  const uninstall = useCallback(async (id: string) => {
    const { error } = (await client.delete("/api/ai/skills/:id", { params: { id } })) as { error?: unknown };
    if (!error) { msg.success("已卸载"); refresh(); }
  }, [refresh]);

  const syncSkill = useCallback(async (id: string) => {
    const { error } = (await client.post("/api/ai/skills/:id/sync", { params: { id } })) as { error?: unknown };
    if (!error) { msg.success("同步完成"); refresh(); }
  }, [refresh]);

  const upgrade = useCallback(async (id: string) => {
    const { error } = (await client.post("/api/ai/skills/:id/upgrade", { params: { id } })) as { error?: unknown };
    if (!error) { msg.success("升级完成"); refresh(); }
  }, [refresh]);

  const viewFiles = useCallback(async (skill: SkillItem) => {
    setDetailSkill(skill);
    const { error, data } = (await client.get("/api/ai/skills/:id/files", { params: { id: skill.id } })) as { error?: unknown; data?: Array<{ path: string; size: number }> };
    if (!error && data) {
      setFileTree(data);
      setSkillFilePath(".");
      setFileDrawerOpen(true);
    }
  }, []);

  const viewFileContent = useCallback(async (skillId: string, path: string) => {
    setEditingFile(false);
    setEditContent("");
    const { error, data } = (await client.get("/api/ai/skills/:id/file", {
      params: { id: skillId },
      query: { path },
    })) as { error?: unknown; data?: string | { content: string } };
    if (!error && data) {
      const text = typeof data === "string" ? data : data.content ?? String(data);
      setFileContent(text);
      setEditContent(text);
      setFileContentPath(path);
    }
  }, []);

  const saveFileContent = useCallback(async () => {
    if (!detailSkill || !fileContentPath) return;
    setSavingFile(true);
    try {
      const { error } = (await client.put("/api/ai/skills/:id/file", {
        params: { id: detailSkill.id },
        query: { path: fileContentPath },
        body: { content: editContent },
      })) as { error?: unknown };
      if (!error) {
        msg.success("保存成功");
        setFileContent(editContent);
        setEditingFile(false);
      }
    } finally {
      setSavingFile(false);
    }
  }, [detailSkill, fileContentPath, editContent]);

  const isEditable = detailSkill?.source === "upload";
  const isMdFile = fileContentPath.endsWith(".md");

  const handleUpload = useCallback(async () => {
    if (!uploadFile) { msg.error("请选择 ZIP 文件"); return; }
    const values = await uploadForm.validateFields();
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("slug", values.slug);
    formData.append("name", values.name);
    if (values.version) formData.append("version", values.version);
    if (values.description) formData.append("description", values.description);

    const { error } = (await client.post("/api/ai/skills/upload", { body: formData })) as { error?: unknown };
    if (!error) {
      msg.success("上传安装成功");
      setUploadOpen(false);
      setUploadFile(null);
      uploadForm.resetFields();
      refresh();
    }
  }, [uploadFile, uploadForm, refresh]);

  const installedColumns: ColumnsType<SkillItem> = [
    {
      title: "技能", dataIndex: "name", width: 220,
      render: (_: unknown, r: SkillItem) => (
        <Space>
          {r.iconUrl ? <img src={r.iconUrl} className="w-7 h-7 rounded-md" /> : <BlockOutlined className="text-xl" />}
          <div>
            <div className="font-medium">{r.name}</div>
            <Text type="secondary" className="text-xs">{r.slug}</Text>
          </div>
        </Space>
      ),
    },
    { title: "来源", dataIndex: "source", width: 80, render: (v: string) => <Tag color={v === "skillhub" ? "blue" : "default"}>{v}</Tag> },
    {
      title: "版本", width: 160,
      render: (_: unknown, r: SkillItem) => (
        <Space size={4}>
          <Tag>{r.installedVersion ?? "-"}</Tag>
          {r.hasUpdate && <Tag color="orange">可升级 → {r.latestVersion}</Tag>}
        </Space>
      ),
    },
    { title: "说明", dataIndex: "description", ellipsis: true },
    {
      title: "启用", dataIndex: "enabled", width: 70,
      render: (v: boolean, r: SkillItem) => <Switch size="small" checked={v} onChange={(checked) => toggleEnabled(r.id, checked)} />,
    },
    { title: "创建时间", dataIndex: "createdAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    { title: "更新时间", dataIndex: "updatedAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    {
      title: "操作", width: 200, fixed: "right",
      render: (_: unknown, r: SkillItem) => (
        <ActionColumn
          items={[
            { label: "文件", onClick: () => viewFiles(r) },
            ...(r.source !== "upload" ? [{ label: "同步", onClick: () => syncSkill(r.id) }] : []),
            ...(r.hasUpdate ? [{ label: "升级", onClick: () => upgrade(r.id) }] : []),
            { label: "卸载", danger: true, confirm: "确认卸载此技能？", onClick: () => uninstall(r.id) },
          ]}
          maxInline={3}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <Space size={8}>
          <Radio.Group value={mode} onChange={e => setMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="installed">已安装 ({total})</Radio.Button>
            <Radio.Button value="store">技能商店</Radio.Button>
          </Radio.Group>
          <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={() => navigate("/app/ai/chat?agent=Skill%20Creator")}>在线创建</Button>
        </Space>
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>上传 ZIP</Button>
          <Button icon={<ReloadOutlined />} onClick={refresh} />
        </Space>
      </div>

      {mode === "installed" ? (
        <Table
          rowKey="id"
          columns={installedColumns}
          dataSource={installed}
          loading={loading}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
          size="small"
          scroll={{ x: 900 }}
        />
      ) : mode === "store" ? (
        <div>
          <Space className="mb-4">
            <Input
              placeholder="搜索技能商店..."
              prefix={<SearchOutlined />}
              value={storeSearch}
              onChange={e => setStoreSearch(e.target.value)}
              onPressEnter={() => searchStore(storeSearch, 1)}
              className="w-[360px]"
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => searchStore(storeSearch, 1)} loading={storeLoading}>搜索</Button>
          </Space>
          <Row gutter={[16, 16]}>
            {storeResults.map(skill => {
              const isInstalled = installedSlugs.has(skill.slug);
              const installedSkill = installedMap.get(skill.slug);
              const canUpdate = isInstalled && installedSkill?.hasUpdate;
              return (
                <Col key={skill.slug} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    size="small"
                    hoverable
                    style={isInstalled ? { borderColor: "#52c41a", borderWidth: 1 } : undefined}
                    actions={[
                      isInstalled
                        ? canUpdate
                          ? <CloudSyncOutlined key="update" onClick={() => upgrade(installedSkill!.id)} />
                          : <CheckCircleOutlined key="installed" className="text-[#52c41a]" />
                        : installingSlug === skill.slug
                          ? <LoadingOutlined key="installing" style={{ color: token.colorPrimary }} />
                          : <CloudDownloadOutlined key="install" onClick={() => installFromStore(skill.slug)} />,
                    ]}
                  >
                    <Card.Meta
                      avatar={skill.iconUrl ? <img src={skill.iconUrl} className="w-10 h-10 rounded-lg" /> : <BlockOutlined className="text-[28px]" />}
                      title={
                        <Space>
                          {skill.name}
                          {isInstalled && <Tag color="green" className="text-[11px]">已安装</Tag>}
                          {canUpdate && <Tag color="orange" className="text-[11px]">可更新</Tag>}
                        </Space>
                      }
                      description={
                        <div>
                          <Paragraph ellipsis={{ rows: 2 }} className="mb-1 text-xs">{skill.description}</Paragraph>
                          <Space size={4}>
                            <Tag>v{skill.version}</Tag>
                            <Text type="secondary" className="text-[11px]"><DownloadOutlined /> {skill.downloads}</Text>
                            <Text type="secondary" className="text-[11px]"><StarFilled className="text-[#faad14]" /> {skill.stars}</Text>
                          </Space>
                        </div>
                      }
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>
          {storeHasMore && (
            <div className="text-center mt-4">
              <Button onClick={() => searchStore(storeSearch, storePage + 1)} loading={storeLoading}>加载更多</Button>
            </div>
          )}
          {storeResults.length === 0 && !storeLoading && <Empty description="搜索技能商店" />}
        </div>
      ) : null}

      {/* 上传 Modal — dropzone 风格 */}
      <Modal title="上传安装技能" open={uploadOpen} onCancel={() => { setUploadOpen(false); setUploadFile(null); }} footer={null} width={480}>
        <Form form={uploadForm} layout="vertical" onFinish={handleUpload}>
          <Upload.Dragger
            accept=".zip"
            maxCount={1}
            fileList={uploadFile ? [{ uid: "-1", name: uploadFile.name, status: "done" }] : []}
            beforeUpload={(file) => { setUploadFile(file); return false; }}
            onRemove={() => setUploadFile(null)}
            className="mb-4"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 ZIP 文件到此处</p>
            <p className="ant-upload-hint">支持 .zip 格式的技能包</p>
          </Upload.Dragger>
          <Form.Item name="slug" label="Slug" rules={[{ required: true }]}>
            <Input placeholder="如 my-custom-skill" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="技能显示名称" />
          </Form.Item>
          <Form.Item name="version" label="版本号" initialValue="1.0.0">
            <Input placeholder="如 1.0.0" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>安装</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 文件浏览 Drawer — 左侧文件树 + 右侧文件内容 */}
      <Drawer
        title={
          <div className="flex items-center gap-3">
            <BlockOutlined />
            <Breadcrumb
              items={[
                {
                  title: <a onClick={() => setSkillFilePath(".")}>{detailSkill?.name ?? "技能"}</a>,
                },
                ...(skillFilePath !== "." ? skillFilePath.split("/").filter(Boolean).map((part, i, arr) => {
                  const partPath = arr.slice(0, i + 1).join("/");
                  const isLast = i === arr.length - 1;
                  return {
                    title: isLast
                      ? <span>{part}</span>
                      : <a onClick={() => setSkillFilePath(partPath)}>{part}</a>,
                  };
                }) : []),
              ]}
            />
            {detailSkill?.installedVersion && <Tag>{detailSkill.installedVersion}</Tag>}
          </div>
        }
        open={fileDrawerOpen}
        onClose={() => { setFileDrawerOpen(false); setFileContent(null); setFileContentPath(""); }}
        placement="bottom"
        size="large"
        styles={{ body: { padding: 0, height: "70vh" } }}
      >
        <div className="flex h-full">
          {/* 左侧：文件目录 */}
          <div
            className="w-[300px] shrink-0 overflow-auto flex flex-col" style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
          >
            {/* 文件列表 */}
            <div className="flex-1 overflow-auto">
              {(() => {
                // 构建当前目录下的条目
                const dirs = new Map<string, boolean>();
                const files: Array<{ name: string; path: string; size: number }> = [];
                for (const item of fileTree) {
                  const rel = skillFilePath === "." ? item.path : item.path.startsWith(skillFilePath + "/") ? item.path.slice(skillFilePath.length + 1) : null;
                  if (rel === null) continue;
                  const slashIdx = rel.indexOf("/");
                  if (slashIdx > 0) {
                    // 子目录
                    dirs.set(rel.slice(0, slashIdx), true);
                  } else if (rel) {
                    files.push({ name: rel, path: item.path, size: item.size });
                  }
                }
                const sortedDirs = Array.from(dirs.keys()).sort();
                files.sort((a, b) => a.name.localeCompare(b.name));

                if (sortedDirs.length === 0 && files.length === 0) {
                  return <Empty description="空目录" image={Empty.PRESENTED_IMAGE_SIMPLE} className="p-10" />;
                }

                return (
                  <>
                    {sortedDirs.map(dirName => (
                      <div
                        key={dirName}
                        className="cursor-pointer flex items-center gap-2 py-[6px] px-[12px]" 
                        onClick={() => setSkillFilePath(skillFilePath === "." ? dirName : `${skillFilePath}/${dirName}`)}
                        onMouseEnter={e => { e.currentTarget.style.background = token.colorBgTextHover; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                      >
                        <FolderOutlined className="text-sm text-[#52c41a]" />
                        <Text ellipsis className="flex-1 text-[13px]">{dirName}</Text>
                      </div>
                    ))}
                    {files.map(file => {
                      const isActive = fileContentPath === file.path;
                      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                      const icon = ext === "md" ? <FileTextOutlined /> : ext === "json" ? <CodeOutlined /> : <FileOutlined />;
                      return (
                        <div
                          key={file.path}
                          className="cursor-pointer flex items-center gap-2" style={{ padding: "6px 12px", background: isActive ? token.controlItemBgActive : undefined, borderLeft: isActive ? `2px solid ${token.colorPrimary}` : "2px solid transparent" }}
                          onClick={() => detailSkill && viewFileContent(detailSkill.id, file.path)}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = token.colorBgTextHover; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ""; }}
                        >
                          <span className="text-[13px]" style={{ color: isActive ? token.colorPrimary : token.colorTextSecondary }}>{icon}</span>
                          <Text ellipsis className="flex-1 text-[13px]" style={{ fontWeight: isActive ? 500 : 400 }}>{file.name}</Text>
                          <Text type="secondary" className="text-[11px] shrink-0">{(file.size / 1024).toFixed(1)}K</Text>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>

          {/* 右侧：文件内容 */}
          <div className="flex-1 overflow-auto flex flex-col" style={{ background: token.colorBgContainer }}>
            {fileContent === null ? (
              <div className="flex items-center justify-center flex-1" style={{ color: token.colorTextQuaternary }}>
                <Empty description="选择文件查看内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <div className="flex flex-col flex-1">
                {/* 标题栏 */}
                <div className="flex items-center justify-between shrink-0" style={{ padding: "8px 16px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                  <Space>
                    <FileTextOutlined />
                    <Text strong>{fileContentPath.split("/").pop()}</Text>
                    <Text type="secondary" className="text-xs">{fileContentPath}</Text>
                    {editingFile && <Tag color="orange">编辑中</Tag>}
                  </Space>
                  <Space size={4}>
                    {isEditable && !editingFile && (
                      <Button size="small" icon={<EditOutlined />} onClick={() => { setEditContent(fileContent ?? ""); setEditingFile(true); }}>编辑</Button>
                    )}
                    {editingFile && (
                      <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingFile} onClick={saveFileContent}>保存</Button>
                    )}
                    {editingFile && (
                      <Button size="small" onClick={() => { setEditingFile(false); setEditContent(fileContent ?? ""); }}>取消</Button>
                    )}
                    <Button size="small" onClick={() => { setFileContent(null); setFileContentPath(""); setEditingFile(false); }}>关闭</Button>
                  </Space>
                </div>
                {/* 内容区域 */}
                <div className="flex-1 overflow-auto">
                  {editingFile && isMdFile ? (
                    <div className="p-4">
                      <MilkdownEditor value={editContent} onChange={setEditContent} />
                    </div>
                  ) : editingFile ? (
                    <Input.TextArea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      autoSize={{ minRows: 20 }}
                      className="border-none rounded-none text-[13px] leading-1.7" style={{ fontFamily: "\'JetBrains Mono\', \'Fira Code\', Consolas, monospace", resize: "none" }}
                    />
                  ) : isMdFile ? (
                    <div className="py-[12px] px-[16px]">
                      <MarkdownPreview content={fileContent ?? ""} />
                    </div>
                  ) : (
                    <pre className="text-[13px] leading-1.7 whitespace-pre-wrap break-words m-0 p-4" style={{ fontFamily: "\'JetBrains Mono\', \'Fira Code\', Consolas, monospace" }}>{fileContent}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────
// MCP 服务 Tab
// ─────────────────────────────────────────

function McpTab() {
  const { token } = theme.useToken();
  const [data, setData] = useState<McpServerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<McpServerItem | null>(null);
  const [form] = Form.useForm();
  const [testing, setTesting] = useState<string | null>(null);
  const [toolsDrawer, setToolsDrawer] = useState<McpServerItem | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data: result } = (await client.get("/api/ai/mcp-servers", {
        query: { page, pageSize: 20 },
      })) as { error?: unknown; data?: PaginatedData<McpServerItem> };
      if (!error && result) {
        setData(result.list);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { refresh(); }, [refresh]);

  // 粘贴内容自动解析
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain").trim();
    if (!text) return;

    let parsed = false;

    // 尝试解析 JSON 格式
    if (text.startsWith("{")) {
      try {
        const json = JSON.parse(text);
        if (json.command || json.url) {
          const updates: Record<string, unknown> = {};
          if (json.command) {
            updates.transportType = "stdio";
            updates.command = json.command;
            if (json.args) updates.argsStr = (json.args as string[]).join("\n");
            if (json.env && typeof json.env === "object") {
              updates.envStr = Object.entries(json.env).map(([k, v]) => `${k}=${v}`).join("\n");
            }
          }
          if (json.url) {
            updates.transportType = "sse";
            updates.url = json.url;
            if (json.headers && typeof json.headers === "object") {
              updates.headersStr = JSON.stringify(json.headers, null, 2);
            }
          }
          if (!json.name && json.command) {
            // 自动提取名称：取命令的第二个参数（通常是包名）
            const parts = [json.command, ...(json.args ?? [])];
            const pkg = parts.find((p: string) => p.startsWith("@") || (!p.startsWith("-") && p !== json.command));
            if (pkg) updates.name = pkg.replace(/^@[^/]+\//, "").replace(/-mcp$/, "").replace(/^server-/, "");
          }
          form.setFieldsValue(updates);
          parsed = true;
        }
      } catch {}
    }

    // 尝试解析命令行格式：VAR=val VAR2=val2 command args...
    if (!parsed) {
      const envVars: Record<string, string> = {};
      let rest = text;

      // 提取开头的 KEY=VALUE 对
      const envParts: string[] = [];
      const segments = rest.split(/\s+/);
      for (const seg of segments) {
        const eqIdx = seg.indexOf("=");
        if (eqIdx > 0 && /^[A-Z_a-z][A-Za-z0-9_]*$/.test(seg.slice(0, eqIdx))) {
          const val = seg.slice(eqIdx + 1);
          // 值不包含空格或者是引号包围的
          if (!val.includes(" ") || val.startsWith('"') || val.startsWith("'")) {
            envParts.push(seg);
            continue;
          }
        }
        break;
      }

      if (envParts.length > 0) {
        for (const part of envParts) {
          const eqIdx = part.indexOf("=");
          const key = part.slice(0, eqIdx);
          let val = part.slice(eqIdx + 1);
          // 去掉引号
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          envVars[key] = val;
        }
        rest = text.slice(text.indexOf(envParts[envParts.length - 1]) + envParts[envParts.length - 1].length).trim();
      }

      // 剩余部分是 command + args
      const cmdParts = rest.split(/\s+/).filter(Boolean);
      if (cmdParts.length > 0) {
        const updates: Record<string, unknown> = {
          transportType: "stdio",
          command: cmdParts[0],
        };
        if (cmdParts.length > 1) updates.argsStr = cmdParts.slice(1).join("\n");
        if (Object.keys(envVars).length > 0) {
          updates.envStr = Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join("\n");
        }
        // 自动提取名称
        const pkg = cmdParts.find((p: string) => p.startsWith("@") || (!p.startsWith("-") && p !== cmdParts[0]));
        if (pkg) updates.name = pkg.replace(/^@[^/]+\//, "").replace(/-mcp$/, "").replace(/^server-/, "");
        form.setFieldsValue(updates);
        parsed = true;
      }
    }

    if (parsed) {
      msg.success("已自动解析并填充表单");
    }
  }, [form]);

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const body: Record<string, unknown> = {
      name: values.name,
      description: values.description,
      transportType: values.transportType,
    };

    if (values.transportType === "stdio") {
      body.command = values.command;
      if (values.argsStr) body.args = values.argsStr.split("\n").map((s: string) => s.trim()).filter(Boolean);
      if (values.envStr) {
        try {
          body.env = Object.fromEntries(
            values.envStr.split("\n").filter(Boolean).map((line: string) => {
              const [k, ...v] = line.split("=");
              return [k.trim(), v.join("=").trim()];
            })
          );
        } catch { /* ignore */ }
      }
    } else {
      body.url = values.url;
      if (values.headersStr) {
        try { body.headers = JSON.parse(values.headersStr); } catch { /* ignore */ }
      }
    }

    if (editItem) {
      const { error } = (await client.put("/api/ai/mcp-servers/:id", { params: { id: editItem.id }, body })) as { error?: unknown };
      if (!error) { msg.success("更新成功"); setEditOpen(false); refresh(); }
    } else {
      const { error } = (await client.post("/api/ai/mcp-servers", { body })) as { error?: unknown };
      if (!error) { msg.success("创建成功"); setEditOpen(false); refresh(); }
    }
  }, [form, editItem, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    const { error } = (await client.delete("/api/ai/mcp-servers/:id", { params: { id } })) as { error?: unknown };
    if (!error) { msg.success("已删除"); refresh(); }
  }, [refresh]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const { error, data: result } = (await client.post("/api/ai/mcp-servers/:id/test", { params: { id } })) as {
        error?: unknown; data?: { success: boolean; tools?: Array<{ name: string; description: string }>; error?: string }
      };
      if (!error && result) {
        if (result.success) {
          msg.success(`连接成功! 发现 ${result.tools?.length ?? 0} 个工具`);
        } else {
          msg.error(`连接失败: ${result.error}`);
        }
        refresh();
      }
    } finally {
      setTesting(null);
    }
  }, [refresh]);

  const openEdit = (item?: McpServerItem) => {
    setEditItem(item ?? null);
    if (item) {
      form.setFieldsValue({
        name: item.name,
        description: item.description,
        transportType: item.transportType,
        command: item.command,
        argsStr: (item.args ?? []).join("\n"),
        envStr: item.env ? Object.entries(item.env).map(([k, v]) => `${k}=${v}`).join("\n") : "",
        url: item.url,
        headersStr: item.headers ? JSON.stringify(item.headers, null, 2) : "",
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ transportType: "stdio" });
    }
    setEditOpen(true);
  };

  const columns: ColumnsType<McpServerItem> = [
    {
      title: "名称", dataIndex: "name", width: 180,
      render: (v: string, r: McpServerItem) => (
        <Space>
          <ApiOutlined style={{ color: r.enabled ? "#1677ff" : "#d9d9d9" }} />
          <div>
            <div className="font-medium">{v}</div>
            {r.description && <Text type="secondary" className="text-xs">{r.description}</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: "传输", dataIndex: "transportType", width: 80,
      render: (v: string) => <Tag color={v === "stdio" ? "green" : "blue"}>{v}</Tag>,
    },
    {
      title: "地址", width: 260,
      render: (_: unknown, r: McpServerItem) => (
        <Text ellipsis className="text-xs max-w-[240px]">
          {r.transportType === "stdio" ? `${r.command} ${(r.args ?? []).join(" ")}` : r.url}
        </Text>
      ),
    },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: (v: string, r: McpServerItem) => {
        const map: Record<string, { color: string; label: string }> = {
          connected: { color: "green", label: "已连接" },
          error: { color: "red", label: "错误" },
          pending: { color: "default", label: "待测试" },
        };
        const s = map[v] ?? map.pending;
        return (
          <Tooltip title={r.lastError}>
            <Tag color={s.color}>{s.label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "工具数", dataIndex: "toolCount", width: 70,
      render: (v: number, r: McpServerItem) => (
        v > 0
          ? <Button type="link" size="small" onClick={() => setToolsDrawer(r)}>{v}</Button>
          : <Text type="secondary">0</Text>
      ),
    },
    {
      title: "启用", dataIndex: "enabled", width: 60,
      render: (v: boolean, r: McpServerItem) => (
        <Switch
          size="small"
          checked={v}
          onChange={async (checked) => {
            await client.put("/api/ai/mcp-servers/:id/enabled", { params: { id: r.id }, body: { enabled: checked } });
            refresh();
          }}
        />
      ),
    },
    { title: "创建时间", dataIndex: "createdAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    { title: "更新时间", dataIndex: "updatedAt", width: 160, render: (v: string) => <Text type="secondary" className="text-xs">{fmtDate(v)}</Text> },
    {
      title: "操作", width: 180, fixed: "right",
      render: (_: unknown, r: McpServerItem) => (
        <Space size={4}>
          <Tooltip title="测试连接"><Button size="small" icon={<ThunderboltOutlined />} loading={testing === r.id} onClick={() => handleTest(r.id)} /></Tooltip>
          <Tooltip title="编辑"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const transportType = Form.useWatch("transportType", form);

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <Text type="secondary">MCP (Model Context Protocol) 标准的服务端连接管理。支持 stdio（本地进程）和 SSE（远程 HTTP）两种传输方式。</Text>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>添加 MCP 服务</Button>
          <Button icon={<ReloadOutlined />} onClick={refresh} />
        </Space>
      </div>

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={{ current: page, total, pageSize: 20, onChange: setPage }} size="small" scroll={{ x: 1000 }} />

      {/* 编辑 Modal */}
      <Modal
        title={editItem ? "编辑 MCP 服务" : "添加 MCP 服务"}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleSave}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ transportType: "stdio" }}>
          {!editItem && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: token.colorBgTextHover, border: `1px dashed ${token.colorBorder}` }}>
              <Text type="secondary" className="text-xs block mb-2">
                📋 粘贴 MCP 配置自动填充（支持 JSON 配置 或 命令行格式）
              </Text>
              <Input.TextArea
                rows={2}
                placeholder={'粘贴 JSON 配置或命令行，如：\n{"command":"npx","args":["-y","firecrawl-mcp"],"env":{"API_KEY":"xxx"}}\n或\nAPI_KEY=xxx npx -y firecrawl-mcp'}
                onPaste={handlePaste}
                className="text-xs"
              />
            </div>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如 filesystem, github, database" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <TextArea rows={2} placeholder="这个 MCP 服务提供什么能力" />
          </Form.Item>
          <Form.Item name="transportType" label="传输方式" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="stdio">stdio (本地进程)</Radio.Button>
              <Radio.Button value="sse">SSE (远程 HTTP)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {transportType === "stdio" ? (
            <>
              <Form.Item name="command" label="命令" rules={[{ required: true }]} extra="如 npx, node, python3, 或绝对路径">
                <Input placeholder="npx" />
              </Form.Item>
              <Form.Item name="argsStr" label="参数（每行一个）" extra="如 -y @modelcontextprotocol/server-filesystem /path/to/dir">
                <TextArea rows={3} placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"} />
              </Form.Item>
              <Form.Item name="envStr" label="环境变量（KEY=VALUE 每行一个）">
                <TextArea rows={2} placeholder={"API_KEY=sk-xxx\nDEBUG=true"} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item name="url" label="服务 URL" rules={[{ required: true }]}>
                <Input placeholder="http://localhost:3001/sse" />
              </Form.Item>
              <Form.Item name="headersStr" label="请求头（JSON 格式）">
                <TextArea rows={2} placeholder={'{"Authorization": "Bearer xxx"}'} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* 工具列表抽屉 */}
      <Drawer
        title={`${toolsDrawer?.name ?? ""} — 工具列表`}
        open={!!toolsDrawer}
        onClose={() => setToolsDrawer(null)}
        size="default"
      >
        {(toolsDrawer?.toolsSnapshot ?? []).length === 0 ? (
          <Empty description="暂无工具数据，请先测试连接" />
        ) : (
          <div>
            {(toolsDrawer?.toolsSnapshot ?? []).map((tool: { name: string; description: string; inputSchema?: Record<string, unknown> }) => (
              <div key={tool.name} style={{ padding: "12px 0", borderBottom: "1px solid " + token.colorBorderSecondary }}>
                <Space align="start">
                  <FunctionOutlined className="text-lg text-[#1677ff] mt-0.5" />
                  <div>
                    <Text strong>{tool.name}</Text>
                    <div><Text className="text-[13px]">{tool.description}</Text></div>
                    {tool.inputSchema && (
                      <Collapse size="small" ghost className="mt-1">
                        <Collapse.Panel key="schema" header={<Text type="secondary" className="text-[11px]">参数 Schema</Text>}>
                          <pre className="text-[11px] m-0">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                        </Collapse.Panel>
                      </Collapse>
                    )}
                  </div>
                </Space>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────
// 工具 (Tools) Tab
// ─────────────────────────────────────────

function ToolsTab() {
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

export default function AICapabilitiesPage() {
  return (
    <div className="p-6">
      <Card styles={{ body: { paddingTop: 12 } }}>
        <Tabs
          defaultActiveKey="skills"
          items={[
            {
              key: "skills",
              label: <span><BlockOutlined /> 技能 Skills</span>,
              children: <SkillsTab />,
            },
            {
              key: "mcp",
              label: <span><ApiOutlined /> MCP 服务</span>,
              children: <McpTab />,
            },
            {
              key: "tools",
              label: <span><ToolOutlined /> 工具 Tools</span>,
              children: <ToolsTab />,
            },
          ]}
        />
      </Card>
    </div>
  );
}
