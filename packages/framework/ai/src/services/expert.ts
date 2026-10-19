/**
 * 专家管理服务 — 文件化存储 + DB 管理注册表
 *
 * 权威数据在磁盘：<dataDir>/experts/<slug>/<version>/{expert.md, meta.json}
 * DB（ai_expert 表）只记录管理信息：有哪些 / 下载了哪些 / 版本 / 扫描 / 启用。
 * 安装/升级强制安全扫描（fail-closed）；文件与 DB 不一致时以磁盘为准，
 * 运行时读取经 sha256 复核防篡改。
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { VentoStackError } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import type { EventBus } from '@ventostack/events';
import { type ExpertHubError, createExpertHubService, sha256Hex } from './expert-hub';
import type { ExpertHubService, HubExpertMeta, HubManifest } from './expert-hub';
import { scanExpert } from './expert-scan';
import type { ScanResult } from './expert-scan';

// ---- Types ----

export interface ExpertRecord {
  id: string;
  slug: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  latestVersion: string | null;
  installedVersion: string | null;
  contentSha256: string | null;
  filePath: string;
  scanStatus: 'pending' | 'passed' | 'failed';
  scanReport: ScanResult | null;
  remoteUpdatedAt: string | null;
  enabled: boolean;
  installedAt: string | null;
  lastSyncedAt: string | null;
  hasUpdate: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteExpertList {
  manifestVersion: string;
  lastUpdated: string;
  categories: HubManifest['categories'];
  experts: HubExpertMeta[];
}

export interface ExpertServiceDeps {
  db: Database;
  eventBus?: EventBus;
  hub?: ExpertHubService;
  /** 自定义扫描器（默认 scanExpert） */
  scanner?: (
    meta: HubExpertMeta,
    prompt: string,
    options?: { knownTools?: ReadonlySet<string> },
  ) => ScanResult;
  /** 数据目录；默认 ./data/experts，生产 /app/data/experts */
  dataDir?: string;
  /** hub 地址；默认 CloudSmith 公开前缀 */
  hubBaseUrl?: string;
  /** ed25519 公钥（hex）；配置后强制校验 manifest.sig，缺省跳过校验 */
  hubSigningPubkey?: string;
  /** 平台已注册工具名列表（suggestedTools 白名单比对） */
  knownTools?: () => string[] | Promise<string[]>;
  /** Agent 创建器（一键实例化用，由装配层注入；未注入则实例化能力不可用） */
  agentFactory?: (params: {
    name: string;
    description?: string;
    systemPrompt: string;
    /** 团队专家来源标记（写进 ai_agent.config，运行时反查启用团委派） */
    config?: Record<string, unknown>;
    model: string[];
    tenantId: string;
    createdBy: string;
  }) => Promise<{ id: string }>;
  /** 默认对话模型解析（实例化未显式指定 model 时使用；无可用模型返回 null） */
  resolveDefaultModel?: () => Promise<string | null>;
}

export interface ExpertListParams {
  categoryId?: string;
  enabled?: boolean;
  page?: number;
  pageSize?: number;
}

export interface BatchInstallResult {
  installed: ExpertRecord[];
  failed: Array<{ slug: string; reason: string }>;
}

/**
 * 业务码 → HTTP 状态映射：
 * not_found 404；already_* 409；其余视为客户端错误 400，
 * 使路由层 handleError 能返回正确的 4xx 而非兜底 500。
 */
const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  already_installed: 409,
  already_latest: 409,
};

export class ExpertServiceError extends VentoStackError {
  constructor(
    message: string,
    readonly bizCode: string,
  ) {
    super(message, ERROR_STATUS[bizCode] ?? 400, bizCode);
    this.name = 'ExpertServiceError';
  }
}

const MAX_BATCH_SIZE = 50;
const BATCH_CONCURRENCY = 4;

// ---- 服务 ----

export function createExpertService(deps: ExpertServiceDeps) {
  const { db, eventBus } = deps;
  const hub =
    deps.hub ??
    createExpertHubService({
      ...(deps.hubBaseUrl ? { baseUrl: deps.hubBaseUrl } : {}),
      ...(deps.hubSigningPubkey ? { signingPubkey: deps.hubSigningPubkey } : {}),
    });
  const scanner = deps.scanner ?? scanExpert;
  const dataDir = resolve(deps.dataDir ?? './data/experts');
  const expertsDir = join(dataDir, 'experts');
  const manifestsDir = join(dataDir, 'manifests');

  // ---- Helpers ----

  function mapRecord(r: Record<string, unknown>): ExpertRecord {
    const installed = r.installed_version as string | null;
    const latest = r.latest_version as string | null;
    let scanReport: ScanResult | null = null;
    if (r.scan_report) {
      try {
        scanReport = typeof r.scan_report === 'string' ? JSON.parse(r.scan_report) : r.scan_report;
      } catch {
        scanReport = null;
      }
    }
    return {
      id: r.id as string,
      slug: r.slug as string,
      categoryId: (r.category_id as string) ?? null,
      name: r.name as string,
      description: (r.description as string) ?? null,
      latestVersion: latest,
      installedVersion: installed,
      contentSha256: (r.content_sha256 as string) ?? null,
      filePath: r.file_path as string,
      scanStatus: (r.scan_status as ExpertRecord['scanStatus']) ?? 'pending',
      scanReport,
      remoteUpdatedAt:
        r.remote_updated_at instanceof Date
          ? r.remote_updated_at.toISOString()
          : ((r.remote_updated_at as string) ?? null),
      enabled: (r.enabled as boolean) ?? true,
      installedAt:
        r.installed_at instanceof Date
          ? r.installed_at.toISOString()
          : ((r.installed_at as string) ?? null),
      lastSyncedAt:
        r.last_synced_at instanceof Date
          ? r.last_synced_at.toISOString()
          : ((r.last_synced_at as string) ?? null),
      hasUpdate: !!installed && !!latest && installed !== latest,
      tenantId: r.tenant_id as string,
      createdAt:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
      updatedAt:
        r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ''),
    };
  }

  function validateSlug(slug: string): void {
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(slug)) {
      throw new ExpertServiceError(`非法 slug：${slug}`, 'invalid_slug');
    }
  }

  /** 版本目录绝对路径；校验最终路径仍在 expertsDir 内（防穿越） */
  function versionDir(slug: string, version: string): string {
    const dir = resolve(join(expertsDir, slug, version));
    if (dir !== expertsDir && !dir.startsWith(expertsDir + sep)) {
      throw new ExpertServiceError('路径非法', 'invalid_path');
    }
    return dir;
  }

  async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function findMeta(slug: string): Promise<HubExpertMeta> {
    const manifest = await hub.fetchManifest();
    const meta = manifest.experts.find((e) => e.slug === slug);
    if (!meta) throw new ExpertServiceError(`hub 中不存在专家：${slug}`, 'not_found');
    return meta;
  }

  /** 最佳努力落 manifest 快照（离线浏览/审计用） */
  async function snapshotManifest(manifest: HubManifest): Promise<void> {
    try {
      await ensureDir(manifestsDir);
      await writeFile(
        join(manifestsDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
      );
    } catch {
      /* 快照失败不阻塞 */
    }
  }

  async function knownToolSet(): Promise<Set<string> | undefined> {
    if (!deps.knownTools) return undefined;
    try {
      return new Set(await deps.knownTools());
    } catch {
      return undefined;
    }
  }

  /**
   * 下载 + 校验 + 扫描 + 落盘（临时目录 → 原子 rename）
   * 返回磁盘上的最终目录与扫描结果。
   */
  async function downloadAndStage(
    meta: HubExpertMeta,
  ): Promise<{ dir: string; prompt: string; scan: ScanResult }> {
    const prompt = await hub.fetchPrompt(meta);
    const knownTools = await knownToolSet();
    const scan = scanner(meta, prompt, knownTools ? { knownTools } : undefined);
    if (scan.status === 'failed') {
      throw new ExpertServiceError(
        `专家 ${meta.slug} 安全扫描未通过：${scan.findings
          .filter((f) => f.severity === 'critical')
          .map((f) => f.rule)
          .join(', ')}`,
        'scan_failed',
      );
    }

    const dir = versionDir(meta.slug, meta.version);
    const staging = await mkdtemp(join(tmpdir(), 'vento-expert-'));
    try {
      await writeFile(join(staging, 'expert.md'), prompt, 'utf-8');
      await writeFile(
        join(staging, 'meta.json'),
        JSON.stringify({ ...meta, scan }, null, 2),
        'utf-8',
      );
      await ensureDir(join(dir, '..'));
      await rm(dir, { recursive: true, force: true });
      await rename(staging, dir);
    } catch (err) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      throw new ExpertServiceError(
        `写入数据目录失败：${err instanceof Error ? err.message : String(err)}`,
        'storage_error',
      );
    }
    return { dir, prompt, scan };
  }

  async function insertRecord(
    meta: HubExpertMeta,
    scan: ScanResult,
    tenantId: string,
  ): Promise<ExpertRecord> {
    const id = crypto.randomUUID();
    const relativePath = `experts/${meta.slug}/${meta.version}/expert.md`;
    await db.raw(
      `INSERT INTO ai_expert (id, slug, category_id, name, description, latest_version,
        installed_version, content_sha256, file_path, scan_status, scan_report,
        remote_updated_at, enabled, installed_at, last_synced_at, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,NOW(),NOW(),$13)`,
      [
        id,
        meta.slug,
        meta.categoryId,
        meta.name,
        meta.description,
        meta.version,
        meta.version,
        meta.sha256,
        relativePath,
        scan.status,
        JSON.stringify(scan),
        meta.updatedAt,
        tenantId,
      ],
    );
    return (await getById(id, tenantId))!;
  }

  // ---- 市场浏览 ----

  async function listRemote(query?: {
    keyword?: string;
    categoryId?: string;
  }): Promise<RemoteExpertList> {
    const manifest = await hub.fetchManifest();
    await snapshotManifest(manifest);
    let experts = manifest.experts;
    if (query?.categoryId) experts = experts.filter((e) => e.categoryId === query.categoryId);
    if (query?.keyword) {
      const kw = query.keyword.toLowerCase();
      experts = experts.filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          e.description.toLowerCase().includes(kw) ||
          (e.nameEn?.toLowerCase().includes(kw) ?? false) ||
          (e.tags?.some((t) => t.toLowerCase().includes(kw)) ?? false),
      );
    }
    return {
      manifestVersion: manifest.version,
      lastUpdated: manifest.lastUpdated,
      categories: manifest.categories,
      experts,
    };
  }

  // ---- CRUD ----

  async function list(
    tenantId: string,
    params?: ExpertListParams,
  ): Promise<{ list: ExpertRecord[]; total: number }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let idx = 2;
    if (params?.categoryId) {
      conditions.push(`category_id = $${idx++}`);
      values.push(params.categoryId);
    }
    if (params?.enabled !== undefined) {
      conditions.push(`enabled = $${idx++}`);
      values.push(params.enabled);
    }
    const where = conditions.join(' AND ');

    const countRows = (await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_expert WHERE ${where}`,
      values,
    )) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.cnt ?? 0);

    const rows = (await db.raw(
      `SELECT * FROM ai_expert WHERE ${where} ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    )) as Array<Record<string, unknown>>;
    return { list: rows.map(mapRecord), total };
  }

  async function getById(id: string, tenantId: string): Promise<ExpertRecord | null> {
    const rows = (await db.raw('SELECT * FROM ai_expert WHERE id = $1 AND tenant_id = $2', [
      id,
      tenantId,
    ])) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapRecord(rows[0]) : null;
  }

  async function getBySlug(slug: string, tenantId: string): Promise<ExpertRecord | null> {
    const rows = (await db.raw('SELECT * FROM ai_expert WHERE slug = $1 AND tenant_id = $2', [
      slug,
      tenantId,
    ])) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapRecord(rows[0]) : null;
  }

  async function setEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> {
    const record = await getById(id, tenantId);
    if (!record) throw new ExpertServiceError('专家不存在', 'not_found');
    // 启用时要求扫描已通过
    if (enabled && record.scanStatus !== 'passed') {
      throw new ExpertServiceError('扫描未通过的专家不可启用', 'scan_not_passed');
    }
    await db.raw(
      'UPDATE ai_expert SET enabled = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [enabled, id, tenantId],
    );
    await eventBus?.emit('ai.expert.enabled', { id, slug: record.slug, enabled, tenantId });
  }

  async function uninstall(id: string, tenantId: string): Promise<void> {
    const record = await getById(id, tenantId);
    if (!record) throw new ExpertServiceError('专家不存在', 'not_found');
    // 删除该 slug 的全部版本目录
    const slugDir = resolve(join(expertsDir, record.slug));
    if (slugDir.startsWith(expertsDir + sep) && existsSync(slugDir)) {
      await rm(slugDir, { recursive: true, force: true }).catch(() => {});
    }
    await db.raw('DELETE FROM ai_expert WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    await eventBus?.emit('ai.expert.uninstalled', { id, slug: record.slug, tenantId });
  }

  // ---- 安装 / 批量 / 升级 / 同步 ----

  async function install(slug: string, tenantId: string): Promise<ExpertRecord> {
    validateSlug(slug);
    const existing = await getBySlug(slug, tenantId);
    if (existing) {
      throw new ExpertServiceError(
        `专家 "${slug}" 已安装 (v${existing.installedVersion})`,
        'already_installed',
      );
    }
    const meta = await findMeta(slug);

    // team：自动补装缺失成员（manifest 校验已保证成员为 agent 类型，无嵌套）
    if (meta.expertType === 'team' && meta.members?.length) {
      const missing: string[] = [];
      for (const m of meta.members) {
        if (!(await getBySlug(m, tenantId))) missing.push(m);
      }
      if (missing.length > 0) {
        const result = await installBatch(missing, tenantId);
        if (result.failed.length > 0) {
          throw new ExpertServiceError(
            `团队 ${slug} 成员安装失败：${result.failed.map((f) => f.slug).join(', ')}`,
            'member_install_failed',
          );
        }
      }
    }

    const { scan } = await downloadAndStage(meta);
    const record = await insertRecord(meta, scan, tenantId);
    await eventBus?.emit('ai.expert.installed', {
      id: record.id,
      slug,
      version: meta.version,
      tenantId,
    });
    return record;
  }

  async function installBatch(slugs: string[], tenantId: string): Promise<BatchInstallResult> {
    if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > MAX_BATCH_SIZE) {
      throw new ExpertServiceError(`批量安装数量须为 1..${MAX_BATCH_SIZE}`, 'invalid_batch');
    }
    const unique = [...new Set(slugs)];
    for (const slug of unique) validateSlug(slug);

    const installed: ExpertRecord[] = [];
    const failed: Array<{ slug: string; reason: string }> = [];

    // 并发上限 BATCH_CONCURRENCY，逐个容错
    const queue = [...unique];
    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const slug = queue.shift()!;
        try {
          installed.push(await install(slug, tenantId));
        } catch (err) {
          failed.push({
            slug,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(BATCH_CONCURRENCY, queue.length) }, () => worker()),
    );
    return { installed, failed };
  }

  async function checkUpdates(
    tenantId: string,
  ): Promise<Array<{ id: string; slug: string; installed: string; latest: string }>> {
    const { list: records } = await list(tenantId, { enabled: true });
    const manifest = await hub.fetchManifest();
    await snapshotManifest(manifest);
    const updates: Array<{ id: string; slug: string; installed: string; latest: string }> = [];
    for (const record of records) {
      const meta = manifest.experts.find((e) => e.slug === record.slug);
      if (!meta) continue;
      if (meta.version !== record.installedVersion) {
        await db.raw(
          'UPDATE ai_expert SET latest_version = $1, last_synced_at = NOW(), updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          [meta.version, record.id, tenantId],
        );
        updates.push({
          id: record.id,
          slug: record.slug,
          installed: record.installedVersion ?? '',
          latest: meta.version,
        });
      }
    }
    return updates;
  }

  async function upgrade(id: string, tenantId: string): Promise<ExpertRecord> {
    const record = await getById(id, tenantId);
    if (!record) throw new ExpertServiceError('专家不存在', 'not_found');
    const meta = await findMeta(record.slug);
    if (meta.version === record.installedVersion) {
      throw new ExpertServiceError('已是最新版本', 'already_latest');
    }
    const { scan } = await downloadAndStage(meta);
    await db.raw(
      `UPDATE ai_expert SET installed_version = $1, latest_version = $1, content_sha256 = $2,
        scan_status = $3, scan_report = $4, remote_updated_at = $5, last_synced_at = NOW(), updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7`,
      [meta.version, meta.sha256, scan.status, JSON.stringify(scan), meta.updatedAt, id, tenantId],
    );
    const updated = (await getById(id, tenantId))!;
    await eventBus?.emit('ai.expert.upgraded', {
      id,
      slug: record.slug,
      oldVersion: record.installedVersion,
      newVersion: meta.version,
      tenantId,
    });
    return updated;
  }

  // ---- 运行时读取（注入用，fail-closed） ----

  /**
   * 读取单条记录对应的磁盘专家内容并做 sha256 复核（不含 team 组合）。
   * 任何失败返回 null。
   */
  async function readOwnContent(
    record: ExpertRecord,
  ): Promise<{ meta: HubExpertMeta; prompt: string } | null> {
    try {
      const absPath = resolve(join(dataDir, record.filePath));
      if (!absPath.startsWith(expertsDir + sep)) return null;
      if (!existsSync(absPath)) return null;
      const prompt = await readFile(absPath, 'utf-8');
      if (record.contentSha256 && sha256Hex(prompt) !== record.contentSha256) return null;
      const metaPath = resolve(join(absPath, '..', 'meta.json'));
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(await readFile(metaPath, 'utf-8')) as HubExpertMeta;
      return { meta, prompt };
    } catch {
      return null;
    }
  }

  /**
   * 按记录读取专家内容并做 sha256 复核；team 类型默认组合全部成员的 prompt。
   * composeTeam=false 时 team 仅返回主 prompt（协调者模式运行时用：成员清单由
   * resolveTeamMembers 运行时解析，不拼成员全文，避免成员 prompt 混入协调者上下文）。
   * 任何失败（文件缺失/被篡改/成员不可用）返回 null，调用方必须忽略该专家。
   */
  async function readExpertContent(
    id: string,
    tenantId: string,
    options: { composeTeam?: boolean } = {},
  ): Promise<{ meta: HubExpertMeta; prompt: string } | null> {
    const composeTeam = options.composeTeam !== false;
    try {
      const record = await getById(id, tenantId);
      if (!record || !record.enabled || record.scanStatus !== 'passed') return null;
      const own = await readOwnContent(record);
      if (!own) return null;

      // team：组合成员 prompt（成员缺一不可，fail-closed）
      if (own.meta.expertType === 'team' && composeTeam) {
        const sections: string[] = [own.prompt];
        for (const memberSlug of own.meta.members ?? []) {
          const memberRecord = await getBySlug(memberSlug, tenantId);
          if (!memberRecord || !memberRecord.enabled || memberRecord.scanStatus !== 'passed') {
            return null;
          }
          const memberContent = await readOwnContent(memberRecord);
          if (!memberContent) return null;
          sections.push(
            `\n---\n## 团队成员：${memberContent.meta.name}（${memberSlug}）\n\n${memberContent.prompt}`,
          );
        }
        return { meta: own.meta, prompt: sections.join('\n\n') };
      }

      return own;
    } catch {
      return null;
    }
  }

  // ---- 一键实例化为 Agent ----

  /**
   * 解析团队专家的可委派成员清单（团委派模式用）。
   * 仅 team 类型返回成员；任何成员不可用（未安装/停用/扫描未过）返回 null（fail-closed）。
   */
  async function resolveTeamMembers(
    expertIdOrSlug: string,
    tenantId: string,
  ): Promise<Array<{ id: string; slug: string; name: string; description?: string }> | null> {
    try {
      // 兼容记录 ID 与 slug 两种引用（config.sourceExpert 存 slug，会话绑定用记录 ID）
      const record =
        (await getById(expertIdOrSlug, tenantId)) ?? (await getBySlug(expertIdOrSlug, tenantId));
      if (!record || !record.enabled || record.scanStatus !== 'passed') return null;
      const own = await readOwnContent(record);
      if (!own || own.meta.expertType !== 'team') return null;
      const members: Array<{ id: string; slug: string; name: string; description?: string }> = [];
      for (const slug of own.meta.members ?? []) {
        const m = await getBySlug(slug, tenantId);
        if (!m || !m.enabled || m.scanStatus !== 'passed') return null;
        members.push({
          id: m.id,
          slug: m.slug,
          name: m.name,
          ...(m.description ? { description: m.description } : {}),
        });
      }
      return members.length > 0 ? members : null;
    } catch {
      return null;
    }
  }

  /**
   * 把专家（含 team 组合内容）实例化为独立 ai_agent。
   * system_prompt = 专家组合 prompt（运行时 Role Override 的固化形态）；
   * 模型缺省取平台默认对话模型。
   */
  async function instantiate(
    id: string,
    tenantId: string,
    opts: { createdBy: string; name?: string; model?: string[] },
  ): Promise<{ agentId: string; expertSlug: string; expertVersion: string; model: string[] }> {
    if (!deps.agentFactory) {
      throw new ExpertServiceError('当前装配未启用 Agent 实例化能力', 'not_supported');
    }
    const record = await getById(id, tenantId);
    if (!record) throw new ExpertServiceError('专家不存在', 'not_found');
    const content = await readExpertContent(id, tenantId);
    if (!content) {
      throw new ExpertServiceError(
        '专家内容不可用（未启用、扫描未通过或文件校验失败）',
        'content_unavailable',
      );
    }

    // team：实例化为协调者模式——system_prompt 只含团队主 prompt 与协作说明，
    // 成员清单运行时经 config.sourceExpert 反查解析（成员启停/升级即时生效），
    // 委派能力由运行时注入的 delegate_expert 工具提供。
    let systemPrompt = content.prompt;
    if (content.meta.expertType === 'team') {
      const own = await readOwnContent(record);
      if (!own) {
        throw new ExpertServiceError(
          '专家内容不可用（未启用、扫描未通过或文件校验失败）',
          'content_unavailable',
        );
      }
      systemPrompt = `${own.prompt}

---
## 团队协作模式

你是本团队的协调者。你的职责是拆解任务、委派执行、把关与汇总成果：

1. 按成员专长拆分子任务，通过 delegate_expert 工具委派给对应成员。
2. 委派的 task 必须自包含：成员在独立上下文中运行，看不到当前对话，需要把背景、要求、输出格式写全。
3. 收到成员成果后你要审校、整合；成果不合格可补充上下文重新委派。
4. 简单的事务性内容（澄清、格式调整）不需要委派，你直接处理。
5. 最终回复以你的汇总为准，说明哪些成员参与了哪些部分。

当前可委派的成员清单以 delegate_expert 工具描述为准。`;
    }

    let model = opts.model;
    if (model && model.length > 0) {
      if (model.length > 10 || model.some((m) => !m || m.length > 128)) {
        throw new ExpertServiceError('model 非法（1..10 项，每项 ≤128 字符）', 'invalid_model');
      }
    } else {
      const fallback = (await deps.resolveDefaultModel?.()) ?? null;
      if (!fallback) {
        throw new ExpertServiceError(
          '未指定 model 且平台未配置默认对话模型，请先在模型配置中设置 default_chat',
          'no_default_model',
        );
      }
      model = [fallback];
    }

    const agent = await deps.agentFactory({
      name: (opts.name ?? record.name).slice(0, 128),
      description: record.description ?? undefined,
      systemPrompt,
      ...(content.meta.expertType === 'team'
        ? { config: { sourceExpert: record.slug, sourceExpertVersion: content.meta.version } }
        : {}),
      model,
      tenantId,
      createdBy: opts.createdBy,
    });

    await eventBus?.emit('ai.expert.instantiated', {
      id: record.id,
      slug: record.slug,
      version: content.meta.version,
      agentId: agent.id,
      tenantId,
    });
    return {
      agentId: agent.id,
      expertSlug: record.slug,
      expertVersion: content.meta.version,
      model,
    };
  }

  return {
    listRemote,
    list,
    getById,
    getBySlug,
    setEnabled,
    uninstall,
    install,
    installBatch,
    checkUpdates,
    upgrade,
    readExpertContent,
    resolveTeamMembers,
    instantiate,
  };
}

export type { ExpertHubError };

export type ExpertService = ReturnType<typeof createExpertService>;
