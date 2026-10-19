#!/usr/bin/env bun
/**
 * 专家包工具 — lint / pack / publish
 *
 * 专家作者工作流（配合 docs/specs/ai-expert-authoring.md）：
 *   1. 在 hub 源目录编写 experts/<slug>.md（默认 ./expert-hub/）
 *   2. bun run scripts/convert-experts.ts lint <slug>   # 结构 + 安全扫描
 *   3. bun run scripts/convert-experts.ts pack          # 生成 dist/（manifest.json + experts/）
 *   4. 人工复核 dist/ 后：
 *      bun run scripts/convert-experts.ts publish       # 上传 CloudSmith（需 CLOUD_SMITH_TOKEN）
 *
 * token 边界：CLOUD_SMITH_TOKEN 仅本 publish 命令使用，严禁写进 URL/日志/仓库。
 * 下载链路为匿名公开地址，与服务端无关。
 */

import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { sha256Hex } from '../packages/framework/ai/src/services/expert-hub';
import { MAX_PROMPT_LENGTH, scanExpert } from '../packages/framework/ai/src/services/expert-scan';

const ROOT = resolve(import.meta.dir, '..');
const HUB_SRC_DIR = process.env.EXPERT_HUB_SRC_DIR
  ? resolve(ROOT, process.env.EXPERT_HUB_SRC_DIR)
  : join(ROOT, 'expert-hub');
const DIST_DIR = join(HUB_SRC_DIR, 'dist');

const CLOUDSMITH_API = 'https://api.cloudsmith.io/v1/packages/vento/ventostack';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

interface Frontmatter {
  name?: string;
  description?: string;
  emoji?: string;
  version?: string;
  [key: string]: unknown;
}

interface RegistryEntry {
  slug: string;
  categoryId: string;
  nameEn?: string;
  descriptionEn?: string;
  avatarUrl?: string;
  expertType?: string;
  /** team 专属：成员 slug 列表（成员必须为 registry 中的 agent 类型专家） */
  members?: string[];
  suggestedTools?: string[];
  tags?: string[];
  quickPrompts?: string[];
  defaultInitPrompt?: string;
}

interface Registry {
  version: string;
  categories: Array<{ id: string; name: string; nameEn?: string }>;
  experts: RegistryEntry[];
}

// ---- frontmatter 解析（与 ai 包 loader 一致的简单格式） ----

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---')) return { frontmatter: {}, body: normalized };
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: normalized };
  const yaml = normalized.slice(4, end);
  const body = normalized.slice(end + 4).trim();
  const frontmatter: Frontmatter = {};
  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value: unknown = trimmed.slice(idx + 1).trim();
    if (
      typeof value === 'string' &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

// ---- lint ----

async function lint(slug?: string): Promise<number> {
  const expertsDir = join(HUB_SRC_DIR, 'experts');
  if (!existsSync(expertsDir)) {
    console.error(`[lint] 源目录不存在：${expertsDir}`);
    return 1;
  }
  const files = (await readdir(expertsDir))
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !slug || f === `${slug}.md`);
  if (files.length === 0) {
    console.error(`[lint] 未找到专家文件${slug ? `（${slug}.md）` : ''}`);
    return 1;
  }

  let failed = 0;
  for (const file of files) {
    const fileSlug = file.replace(/\.md$/, '');
    const problems: string[] = [];
    if (!SLUG_RE.test(fileSlug)) problems.push(`slug 非法：${fileSlug}`);

    const content = await readFile(join(expertsDir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (
      !frontmatter.name ||
      typeof frontmatter.name !== 'string' ||
      frontmatter.name.length > 128
    ) {
      problems.push('frontmatter.name 缺失或超长（≤128）');
    }
    if (
      !frontmatter.description ||
      typeof frontmatter.description !== 'string' ||
      frontmatter.description.length > 2048
    ) {
      problems.push('frontmatter.description 缺失或超长（≤2048）');
    }
    const version = typeof frontmatter.version === 'string' ? frontmatter.version : undefined;
    if (!version || !SEMVER_RE.test(version)) problems.push('frontmatter.version 必须为 semver');
    if (body.trim().length === 0) problems.push('正文为空');
    if (body.length > MAX_PROMPT_LENGTH) problems.push(`正文超限（>${MAX_PROMPT_LENGTH} 字符）`);

    // 安全扫描（与安装时同规则）
    const meta = {
      slug: fileSlug,
      categoryId: '',
      name: String(frontmatter.name ?? fileSlug),
      description: String(frontmatter.description ?? ''),
      promptFile: `experts/${file}`,
      version: version ?? '0.0.0',
      sha256: sha256Hex(content),
      expertType: 'agent' as const,
      updatedAt: new Date().toISOString(),
    };
    const scan = scanExpert(meta, body);
    for (const f of scan.findings) {
      problems.push(`[${f.severity}] ${f.rule}: ${f.message}`);
    }
    if (scan.status === 'failed') problems.push('安全扫描未通过');

    if (problems.length > 0) {
      failed++;
      console.error(`✗ ${file}`);
      for (const p of problems) console.error(`    - ${p}`);
    } else {
      console.log(`✓ ${file} (v${version})`);
    }
  }
  return failed > 0 ? 1 : 0;
}

// ---- pack ----

async function pack(): Promise<number> {
  const registryPath = join(HUB_SRC_DIR, 'registry.json');
  if (!existsSync(registryPath)) {
    console.error(`[pack] 缺少 registry.json：${registryPath}`);
    console.error(
      '  registry.json 提供分类与每个专家的 categoryId/tags/quickPrompts 等索引元数据。',
    );
    return 1;
  }
  const registry = JSON.parse(await readFile(registryPath, 'utf-8')) as Registry;
  const categoryIds = new Set(registry.categories.map((c) => c.id));

  const expertsDir = join(HUB_SRC_DIR, 'experts');
  const files = existsSync(expertsDir)
    ? (await readdir(expertsDir)).filter((f) => f.endsWith('.md'))
    : [];
  if (files.length === 0) {
    console.error('[pack] experts/ 下没有专家文件');
    return 1;
  }

  const outDir = DIST_DIR;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'experts'), { recursive: true });

  const manifestExperts: Array<Record<string, unknown>> = [];
  let lastUpdated = '1970-01-01T00:00:00Z';

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const entry = registry.experts.find((e) => e.slug === slug);
    if (!entry) {
      console.error(`✗ ${slug}: registry.json 中缺少该专家的索引条目`);
      continue;
    }
    if (!categoryIds.has(entry.categoryId)) {
      console.error(`✗ ${slug}: categoryId 未定义：${entry.categoryId}`);
      continue;
    }
    const expertType = entry.expertType ?? 'agent';
    if (expertType !== 'agent' && expertType !== 'team') {
      console.error(`✗ ${slug}: expertType 非法（仅 agent|team）：${expertType}`);
      continue;
    }
    // team 校验：members 必填、成员存在于 registry 且为 agent 类型、成员 md 文件存在
    if (expertType === 'team') {
      const members = entry.members ?? [];
      if (members.length === 0) {
        console.error(`✗ ${slug}: team 专家缺少 members`);
        continue;
      }
      let membersOk = true;
      for (const m of members) {
        const memberEntry = registry.experts.find((e) => e.slug === m);
        if (!memberEntry) {
          console.error(`✗ ${slug}: 成员 ${m} 不在 registry 中`);
          membersOk = false;
        } else if ((memberEntry.expertType ?? 'agent') !== 'agent') {
          console.error(`✗ ${slug}: 成员 ${m} 必须为 agent 类型（禁止嵌套 team）`);
          membersOk = false;
        }
        if (!existsSync(join(expertsDir, `${m}.md`))) {
          console.error(`✗ ${slug}: 成员文件不存在：experts/${m}.md`);
          membersOk = false;
        }
      }
      if (!membersOk) continue;
    }
    const content = await readFile(join(expertsDir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const version = String(frontmatter.version ?? '1.0.0');

    // 内容安全复检（fail-closed）
    const meta = {
      slug,
      categoryId: entry.categoryId,
      name: String(frontmatter.name ?? slug),
      description: String(frontmatter.description ?? ''),
      promptFile: file,
      version,
      sha256: sha256Hex(content),
      expertType: expertType as 'agent' | 'team',
      updatedAt: new Date().toISOString(),
    };
    const scan = scanExpert(meta, body);
    if (scan.status === 'failed') {
      console.error(`✗ ${slug}: 安全扫描未通过，跳过`);
      continue;
    }

    await writeFile(join(outDir, 'experts', file), content, 'utf-8');
    const updatedAt = new Date().toISOString();
    lastUpdated = updatedAt > lastUpdated ? updatedAt : lastUpdated;

    manifestExperts.push({
      slug,
      categoryId: entry.categoryId,
      name: frontmatter.name,
      ...(entry.nameEn ? { nameEn: entry.nameEn } : {}),
      description: frontmatter.description,
      ...(entry.descriptionEn ? { descriptionEn: entry.descriptionEn } : {}),
      ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
      // CloudSmith raw 上传会把路径拍平：promptFile 必须是扁平文件名，
      // 下载 URL = <EXPERT_HUB_BASE_URL>/raw/files/<slug>.md
      promptFile: file,
      version,
      sha256: sha256Hex(content),
      expertType,
      ...(expertType === 'team' && entry.members?.length ? { members: entry.members } : {}),
      ...(entry.suggestedTools?.length ? { suggestedTools: entry.suggestedTools } : {}),
      ...(entry.tags?.length ? { tags: entry.tags } : {}),
      ...(entry.quickPrompts?.length ? { quickPrompts: entry.quickPrompts } : {}),
      ...(entry.defaultInitPrompt ? { defaultInitPrompt: entry.defaultInitPrompt } : {}),
      updatedAt,
    });
    console.log(`✓ ${slug} v${version}${expertType === 'team' ? ' [team]' : ''}`);
  }

  const manifest = {
    version: registry.version,
    lastUpdated,
    categories: registry.categories,
    experts: manifestExperts,
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`\n[pack] 产物：${outDir}（${manifestExperts.length} 个专家）`);
  console.log(
    '[pack] 人工复核后执行 publish 上传 CloudSmith（保留相对路径 manifest.json / experts/<slug>.md）',
  );
  return 0;
}

// ---- 签名（可选：CLOUD_SMITH_SIGNING_KEY 配置后自动对 manifest 签名） ----

/** ed25519 签名：返回 hex；服务端以裸公钥 hex + crypto.verify(null, ...) 校验 */
function signManifest(content: Buffer, privateKeyPem: string): string {
  return sign(null, content, createPrivateKey(privateKeyPem)).toString('hex');
}

/** 生成 ed25519 密钥对：私钥自行妥善保管，公钥 hex 配置到服务端 EXPERT_HUB_SIGNING_PUBKEY */
async function keygen(): Promise<number> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  console.log('---- 私钥（PEM，妥善保管，严禁提交仓库；设为 CLOUD_SMITH_SIGNING_KEY） ----');
  console.log(privateKey.export({ format: 'pem', type: 'pkcs8' }).toString().trim());
  console.log('\n---- 公钥（hex，配置到服务端 EXPERT_HUB_SIGNING_PUBKEY） ----');
  console.log(pubDer.subarray(-32).toString('hex'));
  return 0;
}

// ---- publish（唯一使用 CLOUD_SMITH_TOKEN 的地方） ----

const CLOUDSMITH_DL_TEST = 'https://dl.cloudsmith.io/basic/vento/ventostack/raw/files';

/**
 * CloudSmith raw 上传为三步流程（与官方 CLI 一致）：
 *   1. POST /v1/files/{owner}/{repo}/   → 预签名上传位（identifier + upload_url + upload_fields）
 *   2. POST <upload_url>                → multipart 直传 S3（upload_fields + file）
 *   3. POST /v1/packages/.../upload/raw/ → 用 package_file=<identifier> 创建 raw 包
 * 注意：
 *   - 不传 name/version → 下载 URL 为 /raw/files/<filename>（带 version 会变成 /raw/versions/<v>/）
 *   - CloudSmith 会把路径拍平：只支持根目录扁平文件名（<slug>.md / manifest.json）
 *   - 同名重传需 republish: true
 */
async function uploadOne(
  token: string,
  flatName: string,
  content: Buffer,
): Promise<{ ok: boolean; message: string }> {
  const md5 = createHash('md5').update(content).digest('hex');

  // Step 1: 请求预签名上传位
  const step1 = await fetch('https://api.cloudsmith.io/v1/files/vento/ventostack/', {
    method: 'POST',
    headers: { 'X-Api-Key': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: flatName, md5_checksum: md5, method: 'post' }),
  });
  if (step1.status !== 202) {
    return { ok: false, message: `step1 HTTP ${step1.status}` };
  }
  const slot = (await step1.json()) as {
    identifier: string;
    upload_url: string;
    upload_fields: Record<string, string>;
  };

  // Step 2: 直传 S3
  const form = new FormData();
  for (const [k, v] of Object.entries(slot.upload_fields)) form.append(k, v);
  form.append('file', new Blob([content]), flatName);
  const step2 = await fetch(slot.upload_url, { method: 'POST', body: form });
  if (step2.status !== 201) {
    return { ok: false, message: `step2 HTTP ${step2.status}` };
  }

  // Step 3: 创建 raw 包
  const step3 = await fetch(`${CLOUDSMITH_API}/upload/raw/`, {
    method: 'POST',
    headers: { 'X-Api-Key': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_file: slot.identifier, republish: true }),
  });
  if (step3.status !== 201) {
    return { ok: false, message: `step3 HTTP ${step3.status}` };
  }
  return { ok: true, message: `→ ${CLOUDSMITH_DL_TEST}/${flatName}` };
}

async function publish(): Promise<number> {
  const token = process.env.CLOUD_SMITH_TOKEN;
  if (!token) {
    console.error('[publish] 缺少 CLOUD_SMITH_TOKEN 环境变量（仅上传用，勿提交到仓库）');
    return 1;
  }
  const distDir = DIST_DIR;
  if (!existsSync(join(distDir, 'manifest.json'))) {
    console.error('[publish] 请先执行 pack 生成产物');
    return 1;
  }

  const files: Array<[string, string]> = [['manifest.json', 'manifest.json']]; // [本地路径, 扁平文件名]
  const expertsDir = join(distDir, 'experts');
  if (existsSync(expertsDir)) {
    for (const f of await readdir(expertsDir)) files.push([`experts/${f}`, f]);
  }

  // 可选签名：CLOUD_SMITH_SIGNING_KEY（PEM）配置后生成 manifest.sig 一并上传
  const signingKey = process.env.CLOUD_SMITH_SIGNING_KEY;
  if (signingKey) {
    try {
      const manifestBytes = await readFile(join(distDir, 'manifest.json'));
      const sigHex = signManifest(manifestBytes, signingKey);
      await writeFile(join(distDir, 'manifest.sig'), sigHex, 'utf-8');
      files.push(['manifest.sig', 'manifest.sig']);
      console.log('[publish] 已生成 manifest.sig（ed25519）');
    } catch (err) {
      console.error(`[publish] 签名失败：${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  let ok = 0;
  let failed = 0;
  for (const [rel, flatName] of files) {
    const content = await readFile(join(distDir, rel));
    try {
      const result = await uploadOne(token, flatName, content);
      if (result.ok) {
        ok++;
        console.log(`✓ ${flatName} ${result.message}`);
      } else {
        failed++;
        console.error(`✗ ${flatName}: ${result.message}（不打印响应体以防敏感信息）`);
      }
    } catch (err) {
      failed++;
      console.error(`✗ ${flatName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n[publish] 成功 ${ok}，失败 ${failed}`);
  console.log(
    '[publish] 下载 URL = https://dl.cloudsmith.io/public/vento/ventostack/raw/files/<文件名>（需仓库为 Public）',
  );
  return failed > 0 ? 1 : 0;
}

// ---- CLI ----

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'lint':
    process.exit(await lint(arg));
    break;
  case 'pack':
    process.exit(await pack());
    break;
  case 'publish':
    process.exit(await publish());
    break;
  case 'keygen':
    process.exit(await keygen());
    break;
  default:
    console.log(`用法：
  bun run scripts/convert-experts.ts lint [slug]   # 校验专家文件（结构 + 安全扫描）
  bun run scripts/convert-experts.ts pack          # 生成 dist/（manifest.json + experts/）
  bun run scripts/convert-experts.ts publish       # 上传 CloudSmith（需 CLOUD_SMITH_TOKEN；CLOUD_SMITH_SIGNING_KEY 配置后自动签名）
  bun run scripts/convert-experts.ts keygen        # 生成 ed25519 密钥对（manifest 签名用）

源目录：${HUB_SRC_DIR}
  experts/<slug>.md   专家文件
  registry.json       分类与索引元数据`);
    process.exit(command ? 1 : 0);
}
