import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeBaseService } from '../../knowledge-base/service';

describe('knowledge-base markdown outline (自主导航检索)', () => {
  let root: string;
  let kbId: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ventostack-kb-'));
    kbId = 'kb-test';
    await mkdir(join(root, kbId, 'content', 'docs'), { recursive: true });
    await writeFile(
      join(root, kbId, 'content', 'docs', 'guide.md'),
      [
        '---',
        'title: 使用指南',
        '---',
        '# 快速开始',
        '正文内容',
        '## 安装',
        '安装说明',
        '### Linux',
        'Linux 说明',
        '## 配置',
        '配置说明',
        '普通段落',
        '# 常见问题',
        'FAQ 内容',
        '#### 问题一',
        '问题详情',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('extracts heading outline with levels in document order', async () => {
    const service = createKnowledgeBaseService({ storagePath: root, db: {} });

    const outline = await service.outline(kbId, 'docs/guide.md', 'default');

    expect(outline).toEqual([
      { level: 1, text: '快速开始' },
      { level: 2, text: '安装' },
      { level: 3, text: 'Linux' },
      { level: 2, text: '配置' },
      { level: 1, text: '常见问题' },
      { level: 4, text: '问题一' },
    ]);
  });

  test('returns empty for missing file or non-markdown', async () => {
    const service = createKnowledgeBaseService({ storagePath: root, db: {} });

    expect(await service.outline(kbId, 'docs/missing.md', 'default')).toEqual([]);
    expect(await service.outline(kbId, 'docs/none.txt', 'default')).toEqual([]);
  });

  test('ignores headings inside frontmatter', async () => {
    await writeFile(
      join(root, kbId, 'content', 'front.md'),
      '---\ntitle: # 不是标题\ndescription: 描述\n---\n# 真实标题\n内容',
    );
    const service = createKnowledgeBaseService({ storagePath: root, db: {} });

    const outline = await service.outline(kbId, 'front.md', 'default');
    expect(outline).toEqual([{ level: 1, text: '真实标题' }]);
  });
});
