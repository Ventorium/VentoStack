#!/usr/bin/env bun
/**
 * 发布前准备：把各包 package.json 中的 workspace:* 依赖重写为实际版本。
 *
 * 背景：changesets 的 publish 固定走 npm publish，而 npm 不会重写 workspace:*，
 * 导致 npm 上的包 dependencies 保留 workspace:* 协议，下游 bun/npm 安装时解析失败。
 * bun pm pack / bun publish 会自动重写，但 changesets 不使用它们，
 * 因此在 CI 发布前执行本脚本做等价重写。
 *
 * 用法：bun run scripts/prepare-publish.ts
 * 仅修改本地文件，CI 上运行于临时 runner，无需回滚；本地误跑后可用 git checkout 恢复。
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = join(import.meta.dir, '..');

/** 收集 packages/{framework,platform}/* 下所有包及其版本 */
const groups = ['framework', 'platform'];
const versions: Record<string, string> = {};
const manifests: Array<{ name: string; path: string }> = [];

for (const group of groups) {
  const dir = join(ROOT, 'packages', group);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(dir, entry.name, 'package.json');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name && manifest.version) {
        versions[manifest.name] = manifest.version;
        manifests.push({ name: manifest.name, path: manifestPath });
      }
    } catch {
      // 非包目录，跳过
    }
  }
}

let rewritten = 0;
for (const { name, path } of manifests) {
  const raw = await readFile(path, 'utf-8');
  const json = JSON.parse(raw) as Record<string, unknown>;
  let changed = false;
  for (const section of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = json[section] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [dep, range] of Object.entries(deps)) {
      if (range.startsWith('workspace:') && versions[dep]) {
        // 使用 ^ 前缀：与 changesets 内部依赖升级协议一致，
        // 保证 changeset version 对已满足的依赖不再 bump（发布链路幂等）。
        deps[dep] = `^${versions[dep]}`;
        changed = true;
        rewritten++;
      } else if (range.startsWith('workspace:')) {
        throw new Error(`${name}: 无法重写 ${dep}@${range}（workspace 中未找到该包版本）`);
      }
    }
  }
  if (changed) {
    await writeFile(path, `${JSON.stringify(json, null, 2)}\n`);
  }
}

// 校验：发布范围内不应再残留 workspace:
const remaining =
  await $`grep -rl "workspace:" packages/framework/*/package.json packages/platform/*/package.json`.nothrow();
if (remaining.exitCode === 0) {
  console.error('仍残留 workspace: 依赖：\n', remaining.stdout.toString());
  process.exit(1);
}

console.log(
  `prepare-publish: 重写 ${rewritten} 处 workspace:* 依赖为实际版本（${manifests.length} 个包）`,
);
