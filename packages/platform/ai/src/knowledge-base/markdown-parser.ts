/**
 * Markdown 解析器
 * 解析 YAML frontmatter + 提取 [[wiki links]]
 */

export interface ParsedMarkdown {
  frontmatter: Record<string, string>;
  body: string;
  links: string[];
}

/**
 * 解析 YAML frontmatter
 */
export function parseMarkdown(content: string): ParsedMarkdown {
  const frontmatter: Record<string, string> = {};
  let body = content;

  // 解析 frontmatter（--- 包围的区域）
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fmContent = fmMatch[1];
    body = fmMatch[2];

    // 简单的 YAML 解析（支持 key: value 格式）
    for (const line of fmContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        let value = trimmed.slice(colonIdx + 1).trim();

        // 去除引号
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        frontmatter[key] = value;
      }
    }
  }

  // 提取 [[wiki links]]
  const links = extractWikiLinks(body);

  return { frontmatter, body, links };
}

/**
 * 提取 [[link]] 形式的引用
 */
export function extractWikiLinks(content: string): string[] {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const link = match[1].trim();
    if (link && !links.includes(link)) {
      links.push(link);
    }
  }

  return links;
}
