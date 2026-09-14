import { lstat, realpath } from 'node:fs/promises';
import { basename, isAbsolute, resolve, sep } from 'node:path';
import { parseFile } from '../knowledge-base/parsers';

export interface ReadDocumentToolDeps {
  rootPath: string;
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_RESULT_LENGTH = 200_000;

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

export function createReadDocumentTool(deps: ReadDocumentToolDeps) {
  return {
    name: 'read_document',
    description: '解析当前会话附件中的 PDF、Word、Excel、PowerPoint、文本等文稿，并返回 Markdown。收到附件时优先调用此工具读取内容。',
    parameters: [{
      name: 'path',
      type: 'string' as const,
      description: '会话附件的相对路径，例如 attachments/report.pdf',
      required: true,
    }],
    riskLevel: 'low' as const,
    async handler(params: Record<string, unknown>): Promise<{ path: string; content: string; truncated: boolean } | { error: string }> {
      const path = typeof params.path === 'string' ? params.path : '';
      if (!path || path.includes('\0') || isAbsolute(path)) return { error: '附件路径不合法' };
      const root = await realpath(deps.rootPath).catch(() => null);
      const target = resolve(deps.rootPath, path);
      if (!root || !isWithin(resolve(deps.rootPath), target)) return { error: '不允许访问该路径' };
      const actual = await realpath(target).catch(() => null);
      if (!actual || !isWithin(root, actual)) return { error: '附件不存在或路径不合法' };
      const info = await lstat(actual);
      if (!info.isFile() || info.isSymbolicLink()) return { error: '附件路径不是普通文件' };
      if (info.size > (deps.maxFileSize ?? DEFAULT_MAX_FILE_SIZE)) return { error: '附件超过解析大小限制' };
      try {
        const buffer = Buffer.from(await Bun.file(actual).arrayBuffer());
        const parsed = await parseFile(buffer, basename(actual));
        const truncated = parsed.markdown.length > MAX_RESULT_LENGTH;
        return { path, content: parsed.markdown.slice(0, MAX_RESULT_LENGTH), truncated };
      } catch (error) {
        return { error: error instanceof Error ? error.message : '附件解析失败' };
      }
    },
  };
}
