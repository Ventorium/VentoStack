/**
 * Markdown 预览组件 — 基于 @ant-design/x-markdown
 *
 * 原先手写的 Markdown 解析器已移除，改用已安装的 x-markdown 库，
 * 提供完整的 GFM 支持、XSS 防护和流式渲染能力。
 */
import { XMarkdown } from '@ant-design/x-markdown';
import './index.css';

interface MarkdownPreviewProps {
  /** Markdown 内容 */
  content: string;
  /** 根容器额外类名（如字号、行高等工具类） */
  className?: string;
  /**
   * 流式渲染：true 表示还有后续内容（未闭合的链接/图片按 loading 占位），
   * false 时刷新缓存并完成渲染；不传则按静态 Markdown 渲染
   */
  streaming?: boolean;
  /** 单个换行渲染为换行（GFM breaks），适合聊天文本 */
  breaks?: boolean;
}

export default function MarkdownPreview({
  content,
  className,
  streaming,
  breaks,
}: MarkdownPreviewProps) {
  return (
    <XMarkdown
      content={content}
      className={className}
      streaming={streaming === undefined ? undefined : { hasNextChunk: streaming }}
      config={breaks ? { breaks: true } : undefined}
    />
  );
}
