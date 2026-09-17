import { client } from '@/api';
import type { FileEntry } from '@/api/types';
import MarkdownPreview from '@/components/MarkdownPreview';
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons';
import { Empty, Select, Spin, Table, Tooltip, Typography, theme } from 'antd';
import { useCallback, useEffect, useState } from 'react';

const { Text } = Typography;

interface KnowledgePanelProps {
  knowledgeBases: Array<{ id: string; name: string }>;
  /** 外部定位目标（点击对话引用来源）：切到对应知识库并打开该文件 */
  openFile?: { kbId: string; path: string; nonce: number } | null;
}

export default function KnowledgePanel({
  knowledgeBases,
  openFile,
}: KnowledgePanelProps): React.ReactElement {
  const { token } = theme.useToken();
  const [kbId, setKbId] = useState(knowledgeBases[0]?.id);
  const [path, setPath] = useState('.');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    if (!knowledgeBases.some((kb) => kb.id === kbId)) setKbId(knowledgeBases[0]?.id);
  }, [knowledgeBases, kbId]);

  useEffect(() => {
    if (!kbId) return;
    setLoading(true);
    client
      .get('/api/ai/knowledge-bases/:id/files', { params: { id: kbId }, query: { path, depth: 1 } })
      .then(({ data, error }) => setFiles(error ? [] : ((data as FileEntry[] | undefined) ?? [])))
      .finally(() => setLoading(false));
  }, [kbId, path]);

  const loadContent = useCallback(async (targetKbId: string, filePath: string) => {
    setLoading(true);
    try {
      const { data, error } = (await client.get(
        `/api/ai/knowledge-bases/${targetKbId}/files/${filePath}` as never,
      )) as {
        data?: { content: string };
        error?: unknown;
      };
      if (!error && data) setPreview({ path: filePath, content: data.content });
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFile = useCallback(
    (filePath: string) => {
      if (!kbId) return;
      void loadContent(kbId, filePath);
    },
    [kbId, loadContent],
  );

  // 外部定位（对话引用来源点击）：切换知识库、定位到所在目录并打开文件
  useEffect(() => {
    if (!openFile) return;
    const dir = openFile.path.includes('/')
      ? openFile.path.slice(0, openFile.path.lastIndexOf('/'))
      : '.';
    setKbId(openFile.kbId);
    setPath(dir);
    void loadContent(openFile.kbId, openFile.path);
  }, [openFile, loadContent]);

  if (knowledgeBases.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description="当前 Agent 未绑定知识库" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 items-center gap-2 px-5 py-3"
        style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Select
          value={kbId}
          className="w-full max-w-[320px]"
          onChange={(value) => {
            setKbId(value);
            setPath('.');
            setPreview(null);
          }}
          options={knowledgeBases.map((kb) => ({
            value: kb.id,
            label: (
              <Tooltip title={kb.name}>
                <span className="block truncate">{kb.name}</span>
              </Tooltip>
            ),
          }))}
        />
      </div>
      <div className="flex flex-1 min-h-0">
        <div
          className="flex w-[360px] shrink-0 flex-col"
          style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
        >
          <Table<FileEntry>
            rowKey="path"
            size="small"
            showHeader={false}
            pagination={false}
            loading={loading}
            dataSource={files.map(({ children: _children, ...file }) => file)}
            columns={[
              {
                dataIndex: 'name',
                render: (name: string, file) => (
                  <div className="flex min-w-0 items-center gap-2">
                    {file.type === 'directory' ? <FolderOutlined /> : <FileTextOutlined />}
                    <Text ellipsis className="min-w-0 flex-1" title={name}>
                      {name}
                    </Text>
                  </div>
                ),
              },
            ]}
            onRow={(file) => ({
              onClick: () =>
                file.type === 'directory' ? setPath(file.path) : selectFile(file.path),
              className: 'cursor-pointer',
              // 选中文件高亮，与独立知识库页面保持一致
              style:
                file.path === preview?.path ? { background: token.controlItemBgActive } : undefined,
            })}
          />
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading && !preview ? (
            <div className="text-center">
              <Spin />
            </div>
          ) : preview ? (
            <>
              <Text strong ellipsis className="block" title={preview.path}>
                {preview.path}
              </Text>
              <div className="mt-4">
                <MarkdownPreview content={preview.content} />
              </div>
            </>
          ) : (
            <Empty description="选择文件查看内容" />
          )}
        </div>
      </div>
    </div>
  );
}
