/**
 * 知识库文件/目录启用/禁用测试
 * 语义：禁用目录 = 其下所有文件禁用；显式启用 > 显式禁用 > 祖先目录禁用
 * 禁用后：grep/find 检索不到、README 索引不列出、工具读取被拒；ls 标注 disabled
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKnowledgeBaseService } from '../../knowledge-base/service';

describe('knowledge-base file enable/disable', () => {
  let root: string;
  const kbId = 'kb-test';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ventostack-kb-'));
    await mkdir(join(root, kbId, 'content', 'sub'), { recursive: true });
    await writeFile(join(root, kbId, 'content', 'alpha.md'), '# Alpha\nalpha 关键词\n', 'utf-8');
    await writeFile(join(root, kbId, 'content', 'beta.md'), '# Beta\nbeta 关键词\n', 'utf-8');
    await writeFile(join(root, kbId, 'content', 'sub', 'gamma.md'), '# Gamma\ngamma 关键词\n', 'utf-8');
    await writeFile(
      join(root, kbId, 'meta.json'),
      JSON.stringify({ name: 'Test KB', tenantId: 't1' }),
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function createService() {
    return createKnowledgeBaseService({ storagePath: root, db: {} });
  }

  test('setFileEnabled(false) persists to meta.json and isFileDisabled returns true', async () => {
    const service = createService();

    expect(await service.isFileDisabled(kbId, 'alpha.md', 't1')).toBe(false);
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');

    expect(await service.isFileDisabled(kbId, 'alpha.md', 't1')).toBe(true);
    expect(await service.isFileDisabled(kbId, 'beta.md', 't1')).toBe(false);

    // meta.json 保留其他字段
    const meta = JSON.parse(await readFile(join(root, kbId, 'meta.json'), 'utf-8'));
    expect(meta.name).toBe('Test KB');
    expect(meta.tenantId).toBe('t1');
    expect(meta.disabledFiles).toEqual(['alpha.md']);
  });

  test('re-enabling removes from disabled list', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');
    await service.setFileEnabled(kbId, 'alpha.md', true, 't1');

    expect(await service.isFileDisabled(kbId, 'alpha.md', 't1')).toBe(false);
  });

  test('disabling a directory effectively disables all files inside', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'sub', false, 't1');

    // 目录下的文件通过祖先继承被禁用
    expect(await service.isFileDisabled(kbId, 'sub/gamma.md', 't1')).toBe(true);
    // 其他文件不受影响
    expect(await service.isFileDisabled(kbId, 'alpha.md', 't1')).toBe(false);

    // 子文件不可检索
    const grepResults = await service.grep(kbId, 'gamma', undefined, 't1', 10);
    expect(grepResults).toEqual([]);

    const findResults = await service.find(kbId, 'gamma', undefined, undefined, 't1');
    expect(findResults.filter((f) => f.type === 'file')).toEqual([]);

    // README 索引不含子文件
    const readme = await service.cat(kbId, 'README.md', 't1');
    expect(readme?.content).not.toContain('gamma.md');

    // ls 中目录被标注 disabled
    const lsResults = await service.ls(kbId, '.', 2, 't1');
    const sub = lsResults.find((f) => f.name === 'sub');
    expect(sub?.disabled).toBe(true);
  });

  test('a file explicitly re-enabled inside a disabled dir stays searchable', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'sub', false, 't1');
    await service.setFileEnabled(kbId, 'sub/gamma.md', true, 't1');

    const meta = JSON.parse(await readFile(join(root, kbId, 'meta.json'), 'utf-8'));
    expect(meta.disabledFiles).toContain('sub');
    expect(meta.enabledFiles).toContain('sub/gamma.md');

    expect(await service.isFileDisabled(kbId, 'sub/gamma.md', 't1')).toBe(false);

    // 可检索（README.md 含索引链接会匹配到，仅断言目标文件被命中）
    const grepResults = await service.grep(kbId, 'gamma', undefined, 't1', 10);
    expect(grepResults.some((r) => r.path === 'sub/gamma.md')).toBe(true);

    // README 索引包含该文件
    const readme = await service.cat(kbId, 'README.md', 't1');
    expect(readme?.content).toContain('gamma.md');
  });

  test('re-enabling a disabled dir clears stale enabled overrides inside it', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'sub', false, 't1');
    await service.setFileEnabled(kbId, 'sub/gamma.md', true, 't1');
    await service.setFileEnabled(kbId, 'sub', true, 't1');

    const meta = JSON.parse(await readFile(join(root, kbId, 'meta.json'), 'utf-8'));
    expect(meta.disabledFiles).not.toContain('sub');
    expect(meta.enabledFiles).not.toContain('sub/gamma.md');

    // 目录整体恢复正常，子文件未被禁用
    expect(await service.isFileDisabled(kbId, 'sub/gamma.md', 't1')).toBe(false);
  });

  test('disabled files are excluded from grep and find, but visible in ls with disabled flag', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');

    const grepResults = await service.grep(kbId, '关键词', undefined, 't1', 10);
    expect(grepResults.map((r) => r.path).sort()).toEqual(['beta.md', 'sub/gamma.md']);

    const findResults = await service.find(kbId, undefined, undefined, undefined, 't1');
    const findFiles = findResults.filter((f) => f.type === 'file').map((f) => f.path);
    expect(findFiles).toContain('beta.md');
    expect(findFiles).not.toContain('alpha.md');

    const lsResults = await service.ls(kbId, '.', 1, 't1');
    const alpha = lsResults.find((f) => f.name === 'alpha.md');
    const beta = lsResults.find((f) => f.name === 'beta.md');
    expect(alpha?.disabled).toBe(true);
    expect(beta?.disabled).toBeUndefined();
  });

  test('disabled files are excluded from README index', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');

    const readme = await service.cat(kbId, 'README.md', 't1');
    expect(readme?.content).toContain('beta.md');
    expect(readme?.content).not.toContain('alpha.md');
  });

  test('renaming a disabled file keeps it disabled under the new path', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');
    await service.renameFile(kbId, 'alpha.md', 'delta.md', 't1');

    expect(await service.isFileDisabled(kbId, 'alpha.md', 't1')).toBe(false);
    expect(await service.isFileDisabled(kbId, 'delta.md', 't1')).toBe(true);
  });

  test('deleting a disabled file removes it from the disabled list', async () => {
    const service = createService();
    await service.setFileEnabled(kbId, 'alpha.md', false, 't1');
    await service.deleteFile(kbId, 'alpha.md', 't1');

    const meta = JSON.parse(await readFile(join(root, kbId, 'meta.json'), 'utf-8'));
    expect(meta.disabledFiles).toEqual([]);
  });
});
