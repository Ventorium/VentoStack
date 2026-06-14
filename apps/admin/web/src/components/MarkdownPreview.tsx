/**
 * 轻量 Markdown 预览组件（支持标题、引用、列表、表格、行内格式）
 * 零外部依赖，复用于知识库和技能文件浏览
 */
import { theme } from "antd";

type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "hr" }
  | { type: "blockquote"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "list"; items: string[] }
  | { type: "codeblock"; lang: string; code: string }
  | { type: "paragraph"; text: string };

function parseMarkdownBlocks(md: string): MdBlock[] {
  const lines = md.split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1]!.length, text: headingMatch[2]! });
      i++; continue;
    }

    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(line.trim())) {
      blocks.push({ type: "hr" }); i++; continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({ type: "blockquote", text: line.slice(2) }); i++; continue;
    }

    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s/, ""));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // 围栏代码块
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: "codeblock", lang, code: codeLines.join("\n") });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|:\s]+$/.test(lines[i + 1]!)) {
      const parseRow = (row: string) => row.split("|").map(c => c.trim()).filter(Boolean);
      const header = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim().startsWith("|")) {
        rows.push(parseRow(lines[i]!));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
    i++;
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#f472b6", fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace" }}>{part.slice(1, -1)}</code>;
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) return <a key={i} href={linkMatch[2]} className="text-blue-500">{linkMatch[1]}</a>;
    return <span key={i}>{part}</span>;
  });
}

function MarkdownTable({ header, rows }: { header: string[]; rows: string[][] }) {
  const { token } = theme.useToken();
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: token.colorFillQuaternary }}>
            {header.map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-left font-semibold" style={{ border: `1px solid ${token.colorBorderSecondary}` }}>
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5" style={{ border: `1px solid ${token.colorBorderSecondary}` }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MarkdownPreview({ content }: { content: string }) {
  const { token } = theme.useToken();
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="text-sm leading-7" style={{ color: token.colorText }}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const sizes: Record<number, string> = { 1: "text-2xl font-bold mt-4 mb-2", 2: "text-xl font-semibold mt-3 mb-1.5", 3: "text-base font-semibold mt-3 mb-1" };
          return <div key={i} className={sizes[block.level] ?? "text-base font-semibold mt-2 mb-1"}>{renderInline(block.text)}</div>;
        }
        if (block.type === "codeblock") {
          return (
            <pre key={i} className="my-3 overflow-x-auto" style={{ borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary, padding: "14px 18px", fontSize: 13, lineHeight: 1.7, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", color: token.colorText, border: `1px solid ${token.colorBorderSecondary}`, margin: 0 }}>
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.type === "hr") return <div key={i} className="my-3" style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }} />;
        if (block.type === "blockquote") return <div key={i} className="pl-3 mb-1 italic" style={{ borderLeft: `3px solid ${token.colorPrimary}`, color: token.colorTextSecondary }}>{renderInline(block.text)}</div>;
        if (block.type === "table") return <MarkdownTable key={i} header={block.header} rows={block.rows} />;
        if (block.type === "list") {
          return block.items.map((item, j) => (
            <div key={`${i}-${j}`} className="flex gap-2 mb-0.5">
              <span style={{ color: token.colorPrimary, flexShrink: 0 }}>•</span>
              <span>{renderInline(item)}</span>
            </div>
          ));
        }
        return <div key={i} className="mb-0.5">{renderInline(block.text)}</div>;
      })}
    </div>
  );
}
