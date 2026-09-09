import { client } from '@/api';
import type { FileEntry } from '@/api/types';
import MarkdownPreview from '@/components/MarkdownPreview';
import { ArrowLeftOutlined, FileTextOutlined, FolderOutlined } from '@ant-design/icons';
import { Button, Empty, Select, Spin, Table, Typography, theme } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

const { Text } = Typography;

interface KnowledgePanelProps {
  knowledgeBases: Array<{ id: string; name: string }>;
}

export default function KnowledgePanel({
  knowledgeBases,
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

  const openFile = useCallback(
    async (filePath: string) => {
      if (!kbId) return;
      setLoading(true);
      try {
        const { data, error } = (await client.get(
          `/api/ai/knowledge-bases/${kbId}/files/${filePath}` as never,
        )) as {
          data?: { content: string };
          error?: unknown;
        };
        if (!error && data) setPreview({ path: filePath, content: data.content });
      } finally {
        setLoading(false);
      }
    },
    [kbId],
  );

  const parentPath = useMemo(() => {
    const parts = path.split('/').filter((part) => part && part !== '.');
    return parts.length <= 1 ? '.' : parts.slice(0, -1).join('/');
  }, [path]);

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
          className="min-w-[220px]"
          onChange={(value) => {
            setKbId(value);
            setPath('.');
            setPreview(null);
          }}
          options={knowledgeBases.map((kb) => ({ value: kb.id, label: kb.name }))}
        />
        <Text type="secondary">只读</Text>
      </div>
      <div className="flex flex-1 min-h-0">
        <div
          className="flex w-[360px] shrink-0 flex-col"
          style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
        >
          <div className="p-2">
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              disabled={path === '.'}
              onClick={() => setPath(parentPath)}
            >
              上一级
            </Button>
          </div>
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
                  <div className="flex items-center gap-2">
                    {file.type === 'directory' ? <FolderOutlined /> : <FileTextOutlined />}
                    <Text ellipsis>{name}</Text>
                  </div>
                ),
              },
            ]}
            onRow={(file) => ({
              onClick: () => (file.type === 'directory' ? setPath(file.path) : openFile(file.path)),
              className: 'cursor-pointer',
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
              <Text strong>{preview.path}</Text>
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
