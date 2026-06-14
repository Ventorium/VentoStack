/**
 * Skill 管理服务 — 已安装 Skills 的 CRUD、启用/禁用、安装/卸载/同步
 * 数据存储在 ai_skill 表，安装时从 skillhub 下载 zip 并解压
 */
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import { createSkillStoreService } from "./skill-store";
import type { SkillStoreService } from "./skill-store";
import { join, dirname } from "node:path";
import { mkdir, writeFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readZipEntries } from "@ventostack/file2md/parsers/zip-reader";

// ---- Types ----

export interface SkillItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  source: string;
  sourceUrl: string | null;
  latestVersion: string | null;
  installedVersion: string | null;
  changelog: string | null;
  fileTree: unknown;
  skillMdContent: string | null;
  readmeContent: string | null;
  evaluation: unknown;
  securityReports: unknown;
  labels: unknown;
  stats: unknown;
  owner: unknown;
  enabled: boolean;
  installedAt: string | null;
  lastSyncedAt: string | null;
  hasUpdate: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstallFromStoreParams {
  slug: string;
  version?: string;
  tenantId: string;
}

export interface SkillServiceDeps {
  db: Database;
  eventBus?: EventBus;
  storeService?: SkillStoreService;
  storagePath?: string;
}

export function createSkillService(deps: SkillServiceDeps) {
  const { db, eventBus } = deps;
  const store = deps.storeService ?? createSkillStoreService();
  const storagePath = deps.storagePath ?? "./data/skills";

  // ---- Helpers ----

  function mapSkill(r: Record<string, unknown>): SkillItem {
    const installed = r.installed_version as string | null;
    const latest = r.latest_version as string | null;
    return {
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      iconUrl: (r.icon_url as string) ?? null,
      source: r.source as string,
      sourceUrl: (r.source_url as string) ?? null,
      latestVersion: latest,
      installedVersion: installed,
      changelog: (r.changelog as string) ?? null,
      fileTree: typeof r.file_tree === "string" ? JSON.parse(r.file_tree) : r.file_tree,
      skillMdContent: (r.skill_md_content as string) ?? null,
      readmeContent: (r.readme_content as string) ?? null,
      evaluation: r.evaluation,
      securityReports: r.security_reports,
      labels: r.labels,
      stats: r.stats,
      owner: r.owner,
      enabled: (r.enabled as boolean) ?? true,
      installedAt: r.installed_at instanceof Date ? r.installed_at.toISOString() : (r.installed_at as string) ?? null,
      lastSyncedAt: r.last_synced_at instanceof Date ? r.last_synced_at.toISOString() : (r.last_synced_at as string) ?? null,
      hasUpdate: !!installed && !!latest && installed !== latest,
      tenantId: r.tenant_id as string,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    };
  }

  // ---- CRUD ----

  async function list(tenantId: string, params?: { source?: string; enabled?: boolean; page?: number; pageSize?: number }): Promise<{ list: SkillItem[]; total: number }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (params?.source) { conditions.push(`source = $${idx++}`); values.push(params.source); }
    if (params?.enabled !== undefined) { conditions.push(`enabled = $${idx++}`); values.push(params.enabled); }

    const where = conditions.join(" AND ");

    const countRows = await db.raw(`SELECT COUNT(*) as cnt FROM ai_skill WHERE ${where}`, values) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT * FROM ai_skill WHERE ${where} ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;

    return { list: rows.map(mapSkill), total };
  }

  async function getById(id: string, tenantId: string): Promise<SkillItem | null> {
    const rows = await db.raw(`SELECT * FROM ai_skill WHERE id = $1 AND tenant_id = $2`, [id, tenantId]) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapSkill(rows[0]) : null;
  }

  async function getBySlug(slug: string, tenantId: string): Promise<SkillItem | null> {
    const rows = await db.raw(`SELECT * FROM ai_skill WHERE slug = $1 AND tenant_id = $2`, [slug, tenantId]) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapSkill(rows[0]) : null;
  }

  async function setEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> {
    await db.raw(`UPDATE ai_skill SET enabled = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`, [enabled, id, tenantId]);
    // 联动：禁用 skill 时，关闭关联 agent 的该 skill
    if (!enabled) {
      await db.raw(`UPDATE ai_agent_skill SET enabled = FALSE WHERE skill_id = $1 AND tenant_id = $2`, [id, tenantId]);
    }
    await eventBus?.emit("ai.skill.updated", { id, enabled, tenantId });
  }

  async function uninstall(id: string, tenantId: string): Promise<void> {
    const skill = await getById(id, tenantId);
    if (!skill) return;
    // 清理文件
    const skillDir = join(storagePath, skill.slug);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true }).catch(() => {});
    }
    // 删除关联
    await db.raw(`DELETE FROM ai_agent_skill WHERE skill_id = $1 AND tenant_id = $2`, [id, tenantId]);
    await db.raw(`DELETE FROM ai_skill WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    await eventBus?.emit("ai.skill.uninstalled", { id, slug: skill.slug, tenantId });
  }

  // ---- Install from Store ----

  async function installFromStore(params: InstallFromStoreParams): Promise<SkillItem> {
    const { slug, tenantId } = params;

    // 检查是否已安装
    const existing = await getBySlug(slug, tenantId);
    if (existing) {
      throw new Error(`Skill "${slug}" 已安装 (v${existing.installedVersion})`);
    }

    // 获取详情
    const detail = await store.getDetail(slug);
    const version = params.version ?? detail.latestVersion.version;

    // 获取文件树
    const files = await store.getFiles(slug, version);

    // 获取 SKILL.md 内容
    let skillMdContent: string | null = null;
    try {
      skillMdContent = await store.getFileContent(slug, "SKILL.md", version);
    } catch { /* optional */ }

    // 获取 README.md 内容
    let readmeContent: string | null = null;
    try {
      readmeContent = await store.getFileContent(slug, "README.md", version);
    } catch { /* optional */ }

    // 获取评估报告
    const evaluation = await store.getEvaluation(slug);

    // 下载 zip 到本地
    const skillDir = join(storagePath, slug, version);
    await mkdir(skillDir, { recursive: true });
    try {
      const zipBuffer = await store.downloadZip(slug, version);
      await writeFile(join(skillDir, `${slug}.zip`), zipBuffer);
    } catch {
      // zip 下载失败不阻塞安装
    }

    // 写入文件内容到本地
    for (const file of files) {
      if (file.path === "SKILL.md" || file.path === "README.md") continue; // 已获取
      try {
        const content = await store.getFileContent(slug, file.path, version);
        const filePath = join(skillDir, file.path);
        await mkdir(join(filePath, ".."), { recursive: true }).catch(() => {});
        await writeFile(filePath, content, "utf-8");
      } catch {
        // 单文件失败不阻塞
      }
    }

    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_skill (id, slug, name, description, icon_url, source, source_url,
        latest_version, installed_version, changelog, file_tree, skill_md_content, readme_content,
        evaluation, security_reports, labels, stats, owner, enabled, installed_at, last_synced_at, tenant_id)
       VALUES ($1,$2,$3,$4,$5,'skillhub',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,NOW(),NOW(),$18)`,
      [
        id, slug, detail.displayName, detail.summary, detail.iconUrl,
        detail.owner.displayName ? `https://api.skillhub.cn/${detail.owner.handle}` : null,
        detail.latestVersion.version, version,
        detail.latestVersion.changelog,
        JSON.stringify(files),
        skillMdContent, readmeContent,
        evaluation ? JSON.stringify(evaluation) : null,
        JSON.stringify(detail.securityReports),
        JSON.stringify(detail.labels),
        JSON.stringify(detail.stats),
        JSON.stringify(detail.owner),
        tenantId,
      ],
    );

    await eventBus?.emit("ai.skill.installed", { id, slug, version, tenantId });
    return (await getById(id, tenantId))!;
  }

  // ---- Sync / Update ----

  async function syncSkill(id: string, tenantId: string): Promise<{ updated: boolean; oldVersion: string | null; newVersion: string | null }> {
    const skill = await getById(id, tenantId);
    if (!skill) throw new Error("Skill not found");

    const detail = await store.getDetail(skill.slug);
    const latestVersion = detail.latestVersion.version;

    if (latestVersion === skill.installedVersion) {
      // 仅更新元数据
      await db.raw(
        `UPDATE ai_skill SET latest_version = $1, stats = $2, evaluation = $3, security_reports = $4, last_synced_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [latestVersion, JSON.stringify(detail.stats), JSON.stringify(await store.getEvaluation(skill.slug)), JSON.stringify(detail.securityReports), id],
      );
      return { updated: false, oldVersion: skill.installedVersion, newVersion: latestVersion };
    }

    // 有新版本 → 更新 latest_version，不自动升级
    await db.raw(
      `UPDATE ai_skill SET latest_version = $1, stats = $2, security_reports = $3, last_synced_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [latestVersion, JSON.stringify(detail.stats), JSON.stringify(detail.securityReports), id],
    );

    return { updated: true, oldVersion: skill.installedVersion, newVersion: latestVersion };
  }

  async function upgrade(id: string, tenantId: string): Promise<SkillItem> {
    const skill = await getById(id, tenantId);
    if (!skill) throw new Error("Skill not found");
    if (!skill.latestVersion) throw new Error("No latest version available");
    if (skill.latestVersion === skill.installedVersion) throw new Error("Already on latest version");

    const newVersion = skill.latestVersion;
    const files = await store.getFiles(skill.slug, newVersion);

    let skillMdContent: string | null = null;
    try { skillMdContent = await store.getFileContent(skill.slug, "SKILL.md", newVersion); } catch {}

    let readmeContent: string | null = null;
    try { readmeContent = await store.getFileContent(skill.slug, "README.md", newVersion); } catch {}

    const evaluation = await store.getEvaluation(skill.slug);
    const detail = await store.getDetail(skill.slug);

    // 下载新版本
    const skillDir = join(storagePath, skill.slug, newVersion);
    await mkdir(skillDir, { recursive: true });
    try {
      const zipBuffer = await store.downloadZip(skill.slug, newVersion);
      await writeFile(join(skillDir, `${skill.slug}.zip`), zipBuffer);
    } catch {}

    await db.raw(
      `UPDATE ai_skill SET installed_version = $1, file_tree = $2, skill_md_content = $3, readme_content = $4,
       evaluation = $5, changelog = $6, last_synced_at = NOW(), updated_at = NOW()
       WHERE id = $7`,
      [newVersion, JSON.stringify(files), skillMdContent, readmeContent,
       evaluation ? JSON.stringify(evaluation) : null, detail.latestVersion.changelog, id],
    );

    await eventBus?.emit("ai.skill.upgraded", { id, slug: skill.slug, oldVersion: skill.installedVersion, newVersion, tenantId });
    return (await getById(id, tenantId))!;
  }

  async function checkUpdates(tenantId: string): Promise<Array<{ id: string; slug: string; currentVersion: string; latestVersion: string }>> {
    const { list: skills } = await list(tenantId, { enabled: true });
    const updates: Array<{ id: string; slug: string; currentVersion: string; latestVersion: string }> = [];

    for (const skill of skills) {
      try {
        const detail = await store.getDetail(skill.slug);
        if (detail.latestVersion.version !== skill.installedVersion) {
          // 更新 latest_version
          await db.raw(`UPDATE ai_skill SET latest_version = $1, last_synced_at = NOW() WHERE id = $2`, [detail.latestVersion.version, skill.id]);
          updates.push({
            id: skill.id,
            slug: skill.slug,
            currentVersion: skill.installedVersion ?? "",
            latestVersion: detail.latestVersion.version,
          });
        }
      } catch {
        // 单个失败不阻塞
      }
    }

    return updates;
  }

  // ---- Upload (zip) ----

  async function installFromUpload(params: {
    slug: string;
    name: string;
    description?: string;
    zipBuffer: Buffer;
    tenantId: string;
  }): Promise<SkillItem> {
    const { slug, name, tenantId } = params;

    const existing = await getBySlug(slug, tenantId);
    if (existing) throw new Error(`Skill "${slug}" 已安装`);

    // 解压到本地
    const skillDir = join(storagePath, slug, "uploaded");
    await mkdir(skillDir, { recursive: true });

    // 使用内置 ZIP 解析器解压
    const entries = readZipEntries(params.zipBuffer);

    // 预检: 检查是否包含 SKILL.md（可能在子目录中）
    const skillMdEntry = entries.find(e => e.name === "SKILL.md" || e.name.endsWith("/SKILL.md"));
    if (!skillMdEntry) {
      throw new Error("ZIP 包中缺少 SKILL.md 文件，无法安装");
    }

    // 检测是否有公共根目录前缀（如 my-skill/SKILL.md → "my-skill"）
    // 只有当所有条目共享同一个第一层目录时才去掉前缀
    const fileEntries = entries.filter(e => !e.name.endsWith("/"));
    let stripPrefix = "";
    if (fileEntries.length > 0) {
      const firstSegments = new Set(
        fileEntries.map(e => {
          const idx = e.name.indexOf("/");
          return idx > 0 ? e.name.slice(0, idx) : "";
        }),
      );
      // 所有文件共享同一个第一层目录 → 这是 ZIP 包装目录，需要去掉
      if (firstSegments.size === 1 && !firstSegments.has("")) {
        stripPrefix = firstSegments.values().next().value!;
      }
    }

    // 写入所有文件到磁盘
    const files: Array<{ path: string; size: number }> = [];
    for (const entry of fileEntries) {
      let entryPath = entry.name;
      if (stripPrefix && entryPath.startsWith(stripPrefix + "/")) {
        entryPath = entryPath.slice(stripPrefix.length + 1);
      }
      if (!entryPath) continue;

      const fullPath = join(skillDir, entryPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, entry.data);
      files.push({ path: entryPath, size: entry.data.length });
    }

    // 读取 SKILL.md
    const skillMdContent = skillMdEntry.data.toString("utf-8");

    // 读取 README.md
    const readmeEntry = entries.find(e => e.name === "README.md" || e.name.endsWith("/README.md"));
    const readmeContent = readmeEntry ? readmeEntry.data.toString("utf-8") : null;

    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_skill (id, slug, name, description, source, file_tree, skill_md_content, readme_content, installed_version, enabled, installed_at, tenant_id)
       VALUES ($1,$2,$3,$4,'upload',$5,$6,$7,'uploaded',TRUE,NOW(),$8)`,
      [id, slug, name, params.description ?? null, JSON.stringify(files), skillMdContent, readmeContent, tenantId],
    );

    await eventBus?.emit("ai.skill.installed", { id, slug, source: "upload", tenantId });
    return (await getById(id, tenantId))!;
  }

  // ---- Rescan file tree from disk (for uploaded skills with stale data) ----

  async function rescanFileTree(skillId: string, tenantId: string): Promise<Array<{ path: string; size: number }>> {
    const skill = await getById(skillId, tenantId);
    if (!skill) return [];
    const skillDir = join(storagePath, skill.slug, skill.installedVersion ?? "uploaded");
    if (!existsSync(skillDir)) return [];

    const files: Array<{ path: string; size: number }> = [];
    async function walk(dir: string, rel: string) {
      const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const item of items) {
        const itemRel = rel ? `${rel}/${item.name}` : item.name;
        if (item.isDirectory()) {
          await walk(join(dir, item.name), itemRel);
        } else {
          const s = await stat(join(dir, item.name)).catch(() => null);
          files.push({ path: itemRel, size: s?.size ?? 0 });
        }
      }
    }
    await walk(skillDir, "");

    // 更新 DB 中的 file_tree
    await db.raw(`UPDATE ai_skill SET file_tree = $1 WHERE id = $2 AND tenant_id = $3`, [JSON.stringify(files), skillId, tenantId]);
    return files;
  }

  // ---- File content access ----

  async function getFileContent(skillId: string, filePath: string, tenantId: string): Promise<string | null> {
    const skill = await getById(skillId, tenantId);
    if (!skill) return null;

    // 优先从 DB 读取
    if (filePath === "SKILL.md" && skill.skillMdContent) return skill.skillMdContent;
    if (filePath === "README.md" && skill.readmeContent) return skill.readmeContent;

    // 从本地文件系统读取
    const version = skill.installedVersion ?? "uploaded";
    const localPath = join(storagePath, skill.slug, version, filePath);
    if (existsSync(localPath)) {
      return Bun.file(localPath).text();
    }

    // 如果本地没有，尝试从商店获取
    if (skill.source === "skillhub") {
      try {
        return await store.getFileContent(skill.slug, filePath, version);
      } catch {
        return null;
      }
    }

    return null;
  }

  async function writeFileContent(skillId: string, filePath: string, content: string, tenantId: string): Promise<boolean> {
    const skill = await getById(skillId, tenantId);
    if (!skill) return false;
    if (skill.source !== "upload") throw new Error("仅上传安装的技能支持编辑文件");

    const version = skill.installedVersion ?? "uploaded";
    const localPath = join(storagePath, skill.slug, version, filePath);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, content, "utf-8");

    // 如果是 SKILL.md 或 README.md，同步更新 DB
    if (filePath === "SKILL.md") {
      await db.raw(`UPDATE ai_skill SET skill_md_content = $1, updated_at = NOW() WHERE id = $2`, [content, skillId]);
    } else if (filePath === "README.md") {
      await db.raw(`UPDATE ai_skill SET readme_content = $1, updated_at = NOW() WHERE id = $2`, [content, skillId]);
    }
    return true;
  }

  return {
    list, getById, getBySlug, setEnabled, uninstall,
    installFromStore, installFromUpload,
    syncSkill, upgrade, checkUpdates,
    getFileContent, rescanFileTree, writeFileContent,
  };
}

// ---- File tree scanner ----

async function scanDir(dirPath: string, basePath?: string): Promise<Array<{ path: string; size: number }>> {
  const results: Array<{ path: string; size: number }> = [];
  const items = await readdir(dirPath, { withFileTypes: true }).catch(() => []);

  for (const item of items) {
    const fullPath = join(dirPath, item.name);
    const relativePath = basePath ? `${basePath}/${item.name}` : item.name;

    if (item.name === ".git" || item.name === "node_modules") continue;

    if (item.isDirectory()) {
      const children = await scanDir(fullPath, relativePath);
      results.push(...children);
    } else {
      const stats = await stat(fullPath).catch(() => null);
      results.push({ path: relativePath, size: stats?.size ?? 0 });
    }
  }

  return results;
}
