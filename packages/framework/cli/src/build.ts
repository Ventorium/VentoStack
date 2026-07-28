#!/usr/bin/env bun
/**
 * VentoStack monorepo 构建脚本
 *
 * 遍历所有 packages 子包，使用 bun build 将其 src/index.ts 编译到 dist 目录。
 * 构建失败时输出错误信息并在最后以非零状态码退出。
 */

import { unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { $, Glob } from 'bun';

interface PackageManifest {
  name?: string;
}

/** 仓库根目录绝对路径 */
const ROOT = resolve(import.meta.dir, '../../../..');
const packageGlob = new Glob('packages/{framework,platform}/*/package.json');
const packages: Array<{ name: string; dir: string }> = [];

for await (const manifestPath of packageGlob.scan({ cwd: ROOT })) {
  const manifest = (await Bun.file(resolve(ROOT, manifestPath)).json()) as PackageManifest;
  const packageDir = dirname(resolve(ROOT, manifestPath));
  if (manifest.name && (await Bun.file(resolve(packageDir, 'src/index.ts')).exists())) {
    packages.push({ name: manifest.name, dir: packageDir });
  }
}

packages.sort((a, b) => a.name.localeCompare(b.name));

console.log('Building VentoStack packages...\n');

/** 构建失败的包数量 */
let failed = 0;

for (const pkg of packages) {
  process.stdout.write(`  Building ${pkg.name}... `);

  const bundleResult =
    await $`bun build --target=bun --packages=external --outdir=${resolve(pkg.dir, 'dist')} ${resolve(pkg.dir, 'src/index.ts')}`
      .quiet()
      .nothrow();

  const publishConfigPath = resolve(pkg.dir, '.tsconfig.publish.tmp.json');
  await Bun.write(
    publishConfigPath,
    JSON.stringify({
      extends: (await Bun.file(resolve(pkg.dir, 'tsconfig.json')).exists())
        ? './tsconfig.json'
        : resolve(ROOT, 'tsconfig.json'),
      compilerOptions: {
        paths: {},
        preserveSymlinks: true,
        declaration: true,
        emitDeclarationOnly: true,
        noCheck: true,
        rootDir: './src',
        outDir: './dist',
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.ts'],
    }),
  );
  const declarationResult = await $`bunx tsc -p ${publishConfigPath}`.quiet().nothrow();
  await unlink(publishConfigPath);

  if (bundleResult.exitCode === 0 && declarationResult.exitCode === 0) {
    console.log('done');
  } else {
    console.log('FAILED');
    console.error(bundleResult.stderr.toString());
    console.error(bundleResult.stdout.toString());
    console.error(declarationResult.stderr.toString());
    console.error(declarationResult.stdout.toString());
    failed++;
  }
}

console.log(`\nBuild complete. ${packages.length - failed}/${packages.length} packages succeeded.`);

if (failed > 0) {
  process.exit(1);
}
