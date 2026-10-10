/**
 * AI 智能能力管理 — 技能 (Skills)
 */
import { client } from "@/api";
import type { SkillItem, StoreSkillItem, PaginatedData } from "@/api/types";
import { msg } from "@/components/GlobalMessage";
import {
  BlockOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOutlined,
  InboxOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  StarFilled,
  ThunderboltOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Switch,
  Table,
  Tag,
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

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function SkillsTab() {
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
      const { error } = (await client.post("/api/ai/skills/store/:slug/install", {
        params: { slug },
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
          <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={() => navigate("/app/ai/chat/skill-creator")}>在线创建</Button>
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