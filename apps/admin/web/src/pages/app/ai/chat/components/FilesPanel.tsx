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
} from '@ant-design/icons';
import { Empty, Spin, Tag, Typography, theme } from 'antd';
import { useCallback, useEffect, useState } from 'react';

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
            files.map((file) => {
              const isActive = file.path === selected;
              return (
                <div
                  key={file.path}
                  onClick={() => handleSelect(file.path)}
                  className="cursor-pointer flex items-center gap-2 px-2 py-1.5 mb-0.5"
                  style={{
                    borderRadius: token.borderRadiusLG,
                    background: isActive ? token.controlItemBgActive : 'transparent',
                  }}
                >
                  {fileIcon(file.path)}
                  <div className="flex-1 min-w-0">
                    <Text ellipsis className="block text-[13px]">
                      {file.path}
                    </Text>
                    <Text type="secondary" className="text-xs">
                      {fmtSize(file.size)}
                    </Text>
                  </div>
                </div>
              );
            })
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
