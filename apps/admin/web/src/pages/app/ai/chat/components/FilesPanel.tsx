import { client } from '@/api';
import MarkdownPreview from '@/components/MarkdownPreview';
import {
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { Empty, Spin, Tag, Tree, Typography, theme } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const { Text } = Typography;

export interface WorkspaceFile {
  path: string;
  size: number;
  modifiedAt: string;
}

type PreviewKind = 'text' | 'markdown' | 'image' | 'binary';

interface PreviewData {
  kind: PreviewKind;
  name: string;
  content: string;
}

interface FileTreeNode {
  key: string;
  title: string;
  isLeaf: boolean;
  file?: WorkspaceFile;
  children?: FileTreeNode[];
}

function buildFileTree(files: WorkspaceFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let level = root;
    let currentPath = '';
    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let node = level.find((item) => item.key === currentPath);
      if (!node) {
        node = {
          key: currentPath,
          title: part,
          isLeaf,
          ...(isLeaf ? { file } : { children: [] }),
        };
        level.push(node);
      }
      if (!isLeaf) level = node.children ?? [];
    }
  }
  const sort = (nodes: FileTreeNode[]): void => {
    nodes.sort((a, b) => Number(a.isLeaf) - Number(b.isLeaf) || a.title.localeCompare(b.title));
    for (const node of nodes) if (node.children) sort(node.children);
  };
  sort(root);
  return root;
}

function fileIcon(path: string): React.ReactNode {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext))
    return <FileImageOutlined className="text-blue-500" />;
  if (ext === 'pdf') return <FilePdfOutlined className="text-red-500" />;
  if (['docx', 'doc', 'rtf', 'odt'].includes(ext)) return <FileWordOutlined className="text-blue-600" />;
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) return <FileExcelOutlined className="text-green-600" />;
  if (['pptx', 'ppt', 'odp'].includes(ext)) return <FilePptOutlined className="text-orange-500" />;
  if (['md', 'markdown', 'txt', 'json', 'js', 'ts', 'py', 'html', 'css'].includes(ext))
    return <FileTextOutlined className="text-gray-500" />;
  return <FileOutlined className="text-gray-400" />;
}

function fmtSize(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

interface FilesPanelProps {
  files: WorkspaceFile[];
  sessionId?: string;
  /** 外部触发打开指定文件（如点击聊天消息中的引用来源）；nonce 变化时重新加载 */
  openFile?: { path: string; nonce: number } | null;
}

/** 会话文件面板：左侧文件列表，右侧内容预览（文本/Markdown/图片） */
export default function FilesPanel({ files, sessionId, openFile }: FilesPanelProps) {
  const { token } = theme.useToken();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const knownDirectoryKeys = useRef(new Set<string>());
  const treeData = useMemo(() => buildFileTree(files), [files]);

  useEffect(() => {
    const newDirectoryKeys: string[] = [];
    const collect = (nodes: FileTreeNode[]): void => {
      for (const node of nodes) {
        if (!node.isLeaf && !knownDirectoryKeys.current.has(node.key)) {
          knownDirectoryKeys.current.add(node.key);
          newDirectoryKeys.push(node.key);
        }
        if (node.children) collect(node.children);
      }
    };
    collect(treeData);
    if (newDirectoryKeys.length > 0) {
      setExpandedKeys((current) => [...current, ...newDirectoryKeys]);
    }
  }, [treeData]);

  const handleSelect = useCallback(
    async (path: string) => {
      setSelected(path);
      if (!sessionId) return;
      setLoading(true);
      try {
        const { error, data } = (await client.get('/api/ai/conversations/:id/artifacts/preview', {
          params: { id: sessionId },
          query: { path },
        })) as { error?: unknown; data?: PreviewData };
        if (!error && data) setPreview(data);
        else setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (openFile && files.some((f) => f.path === openFile.path)) {
      void handleSelect(openFile.path);
    }
  }, [openFile, files, handleSelect]);

  return (
    <div className="flex h-full min-h-0">
      {/* 左侧：文件列表 */}
      <div
        className="w-[280px] h-full flex flex-col shrink-0"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Text strong className="text-[13px]">
            会话文件
          </Text>
          <Tag className="ml-2">{files.length}</Tag>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {files.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前会话暂无生成文件"
              className="mt-12"
            />
          ) : (
            <Tree<FileTreeNode>
              blockNode
              className="[&_.ant-tree-switcher]:hidden"
              expandedKeys={expandedKeys}
              selectedKeys={selected ? [selected] : []}
              treeData={treeData}
              titleRender={(node) => (
                <div className="flex min-w-0 items-center gap-2 pr-1">
                  {node.isLeaf ? fileIcon(node.key) : <FolderOutlined />}
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={node.title}>
                    {node.title}
                  </span>
                  {node.file && (
                    <span className="ml-auto shrink-0 text-[10px] text-gray-400">
                      {fmtSize(node.file.size)}
                    </span>
                  )}
                </div>
              )}
              onSelect={(_, info) => {
                if (info.node.file) {
                  void handleSelect(info.node.file.path);
                  return;
                }
                setExpandedKeys((current) =>
                  current.includes(info.node.key)
                    ? current.filter((key) => key !== info.node.key)
                    : [...current, info.node.key],
                );
              }}
              onExpand={(keys) => setExpandedKeys(keys.map(String))}
            />
          )}
        </div>
      </div>

      {/* 右侧：内容预览 */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <Empty description="选择文件查看内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin />
          </div>
        ) : !preview ? (
          <div className="flex items-center justify-center h-full">
            <Empty description="无法预览该文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : preview.kind === 'image' ? (
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            <img src={preview.content} alt={preview.name} className="max-w-full h-auto" />
          </div>
        ) : preview.kind === 'binary' ? (
          <div className="flex items-center justify-center h-full">
            <Empty description={`「${preview.name}」为二进制文件，暂不支持预览`} />
          </div>
        ) : preview.kind === 'markdown' ? (
          <div className="flex-1 overflow-auto p-4">
            <MarkdownPreview content={preview.content || '（无内容）'} />
          </div>
        ) : (
          <pre
            className="flex-1 overflow-auto p-4 m-0 text-[13px] leading-6 whitespace-pre-wrap break-words"
            style={{
              background: token.colorBgContainer,
              color: token.colorText,
              fontFamily: 'monospace',
            }}
          >
            {preview.content}
          </pre>
        )}
      </div>
    </div>
  );
}
