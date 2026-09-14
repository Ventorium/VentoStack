import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createReadDocumentTool } from '../../tools/read-document';

describe('读取文档 tool', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'read-document-'));
    await mkdir(join(root, 'attachments'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('parses a session attachment into markdown', async () => {
    await writeFile(join(root, 'attachments', 'note.txt'), 'attachment content');
    const result = await createReadDocumentTool({ rootPath: root }).handler({ path: 'attachments/note.txt' });
    expect(result).toMatchObject({ path: 'attachments/note.txt', truncated: false });
    expect('content' in result ? result.content : '').toContain('attachment content');
  });

  test('rejects paths outside the session artifact root', async () => {
    const result = await createReadDocumentTool({ rootPath: root }).handler({ path: '../secret.txt' });
    expect(result).toEqual({ error: '不允许访问该路径' });
  });
});
