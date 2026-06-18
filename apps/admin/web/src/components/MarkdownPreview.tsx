/**
 * Markdown 预览组件 — 基于 @ant-design/x-markdown
 *
 * 原先手写的 Markdown 解析器已移除，改用已安装的 x-markdown 库，
 * 提供完整的 GFM 支持、XSS 防护和流式渲染能力。
 */
import { XMarkdown } from "@ant-design/x-markdown";

export default function MarkdownPreview({ content }: { content: string }) {
  return <XMarkdown content={content} />;
}
