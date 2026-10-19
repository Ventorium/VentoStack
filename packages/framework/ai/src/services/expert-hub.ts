/**
 * ExpertHub 协议客户端 — CloudSmith raw files 公开分发
 *
 * 下载匿名、零鉴权；manifest + 专家 md 均为静态文件。
 * 响应数据一律经手写校验器（零第三方依赖，风格对齐 skill-store）。
 * 可选 manifest 签名（ed25519）：配置 signingPubkey 后强制校验 manifest.sig。
 */
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { VentoStackError } from '@ventostack/core';

const DEFAULT_HUB_BASE_URL = 'https://dl.cloudsmith.io/public/vento/ventostack/raw/files/';

const USER_AGENT = 'VentoStack/1.0';

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_PROMPT_BYTES = 128 * 1024; // 128KB
const MAX_EXPERTS = 2000;
const MAX_CATEGORIES = 100;
const MAX_TAGS = 8;
const MAX_QUICK_PROMPTS = 5;
const MAX_SUGGESTED_TOOLS = 20;
const MAX_TEAM_MEMBERS = 20;

// ---- Types ----

export interface HubCategory {
  id: string;
  name: string;
  nameEn?: string;
}

export interface HubExpertMeta {
  slug: string;
  categoryId: string;
  name: string;
  nameEn?: string;
  description: string;
  descriptionEn?: string;
  avatarUrl?: string;
  promptFile: string;
  version: string;
  sha256: string;
  expertType: 'agent' | 'team';
  /** team 专属：成员专家 slug 列表（成员必须为 agent 类型且在 manifest 中存在） */
  members?: string[];
  suggestedTools?: string[];
  tags?: string[];
  quickPrompts?: string[];
  defaultInitPrompt?: string;
  updatedAt: string;
}

export interface HubManifest {
  version: string;
  lastUpdated: string;
  categories: HubCategory[];
  experts: HubExpertMeta[];
}

/**
 * 业务码 → HTTP 状态映射：
 * invalid_config 400；hub 网络/资源类错误 502/413；
 * 其余 manifest / 下载内容问题视为上游数据不可用（502），
 * 使路由层 handleError 能返回明确的 4xx/5xx 而非兜底 500。
 */
const HUB_ERROR_STATUS: Record<string, number> = {
  invalid_config: 400,
  hub_resource_too_large: 413,
};

export class ExpertHubError extends VentoStackError {
  constructor(
    message: string,
    readonly hubCode: string,
  ) {
    super(message, HUB_ERROR_STATUS[hubCode] ?? 502, hubCode);
    this.name = 'ExpertHubError';
  }
}

export interface ExpertHubDeps {
  /** hub 根地址（以下载通用前缀结尾）；默认 CloudSmith 公开前缀 */
  baseUrl?: string;
  /** manifest 内存缓存 TTL（毫秒），默认 5 分钟 */
  manifestCacheTtlMs?: number;
  /**
   * ed25519 公钥（hex，32 字节裸格式）。配置后强制校验 manifest.sig 签名
   * （对 manifest.json 原始字节签名），校验失败 fail-closed；不配置则跳过校验。
   */
  signingPubkey?: string;
  /** 注入 fetch（测试用） */
  fetchImpl?: typeof fetch;
}

export interface ExpertHubService {
  /** 获取 manifest（带缓存 + lastUpdated 短路）；force 时绕过缓存 */
  fetchManifest(force?: boolean): Promise<HubManifest>;
  /** 下载专家 prompt 正文并校验 sha256 与大小上限 */
  fetchPrompt(meta: HubExpertMeta): Promise<string>;
  /** 拼接相对路径为完整下载 URL（仅用于头像等前端直连资源） */
  resolveUrl(relativePath: string): string;
  /** 当前 hub 地址（脱敏，仅 baseUrl，无凭据） */
  readonly baseUrl: string;
}

// ---- 校验器 ----

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const CATEGORY_ID_RE = /^[a-z0-9-]{1,64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** hub 相对路径白名单：扁平文件名（CloudSmith raw 上传会拍平子目录）或 avatars/ 前缀，禁穿越 */
const RELATIVE_PATH_RE = /^(?:avatars\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,200}\.(md|png)$/;

function assertString(
  value: unknown,
  field: string,
  maxLength: number,
  required = true,
): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ExpertHubError(`manifest 字段 ${field} 缺失`, 'invalid_manifest');
    return undefined;
  }
  if (typeof value !== 'string')
    throw new ExpertHubError(`manifest 字段 ${field} 类型非法`, 'invalid_manifest');
  if (value.length > maxLength) {
    throw new ExpertHubError(`manifest 字段 ${field} 超长（>${maxLength}）`, 'invalid_manifest');
  }
  return value;
}

function assertStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  itemMaxLength: number,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value))
    throw new ExpertHubError(`manifest 字段 ${field} 必须为数组`, 'invalid_manifest');
  if (value.length > maxItems)
    throw new ExpertHubError(`manifest 字段 ${field} 超过 ${maxItems} 项`, 'invalid_manifest');
  return value.map((item) => {
    const s = assertString(item, field, itemMaxLength);
    return s as string;
  });
}

/** 未知字段拒绝：白名单之外的顶层/专家字段直接失败 */
const MANIFEST_KEYS = new Set(['version', 'lastUpdated', 'categories', 'experts']);
const EXPERT_KEYS = new Set([
  'slug',
  'categoryId',
  'name',
  'nameEn',
  'description',
  'descriptionEn',
  'avatarUrl',
  'promptFile',
  'version',
  'sha256',
  'expertType',
  'members',
  'suggestedTools',
  'tags',
  'quickPrompts',
  'defaultInitPrompt',
  'updatedAt',
]);

function validateManifest(raw: unknown): HubManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ExpertHubError('manifest 必须为对象', 'invalid_manifest');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!MANIFEST_KEYS.has(key)) {
      throw new ExpertHubError(`manifest 含未知字段：${key}`, 'invalid_manifest');
    }
  }

  const version = assertString(obj.version, 'version', 32) as string;
  const lastUpdated = assertString(obj.lastUpdated, 'lastUpdated', 40) as string;
  if (!SEMVER_RE.test(version))
    throw new ExpertHubError('manifest version 非法', 'invalid_manifest');
  if (!ISO_DATE_RE.test(lastUpdated))
    throw new ExpertHubError('manifest lastUpdated 非法', 'invalid_manifest');

  if (!Array.isArray(obj.categories) || obj.categories.length > MAX_CATEGORIES) {
    throw new ExpertHubError(`categories 必须为数组且 ≤${MAX_CATEGORIES} 项`, 'invalid_manifest');
  }
  const categoryIds = new Set<string>();
  const categories: HubCategory[] = obj.categories.map((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      throw new ExpertHubError('category 必须为对象', 'invalid_manifest');
    }
    const cat = c as Record<string, unknown>;
    for (const key of Object.keys(cat)) {
      if (!['id', 'name', 'nameEn'].includes(key)) {
        throw new ExpertHubError(`category 含未知字段：${key}`, 'invalid_manifest');
      }
    }
    const id = assertString(cat.id, 'category.id', 64) as string;
    const name = assertString(cat.name, 'category.name', 128) as string;
    const nameEn = assertString(cat.nameEn, 'category.nameEn', 128, false);
    if (!CATEGORY_ID_RE.test(id))
      throw new ExpertHubError(`categoryId 非法：${id}`, 'invalid_manifest');
    if (categoryIds.has(id)) throw new ExpertHubError(`categoryId 重复：${id}`, 'invalid_manifest');
    categoryIds.add(id);
    return { id, name, ...(nameEn !== undefined ? { nameEn } : {}) };
  });

  if (!Array.isArray(obj.experts) || obj.experts.length > MAX_EXPERTS) {
    throw new ExpertHubError(`experts 必须为数组且 ≤${MAX_EXPERTS} 项`, 'invalid_manifest');
  }
  const slugs = new Set<string>();
  const experts: HubExpertMeta[] = obj.experts.map((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      throw new ExpertHubError('expert 必须为对象', 'invalid_manifest');
    }
    const ex = e as Record<string, unknown>;
    for (const key of Object.keys(ex)) {
      if (!EXPERT_KEYS.has(key)) {
        throw new ExpertHubError(`expert 含未知字段：${key}`, 'invalid_manifest');
      }
    }
    const slug = assertString(ex.slug, 'expert.slug', 128) as string;
    if (!SLUG_RE.test(slug))
      throw new ExpertHubError(`expert slug 非法：${slug}`, 'invalid_manifest');
    if (slugs.has(slug)) throw new ExpertHubError(`expert slug 重复：${slug}`, 'invalid_manifest');
    slugs.add(slug);

    const categoryId = assertString(ex.categoryId, 'expert.categoryId', 64) as string;
    if (!categoryIds.has(categoryId)) {
      throw new ExpertHubError(`expert ${slug} 引用未定义分类：${categoryId}`, 'invalid_manifest');
    }

    const name = assertString(ex.name, 'expert.name', 128) as string;
    const nameEn = assertString(ex.nameEn, 'expert.nameEn', 128, false);
    const description = assertString(ex.description, 'expert.description', 2048) as string;
    const descriptionEn = assertString(ex.descriptionEn, 'expert.descriptionEn', 2048, false);
    const avatarUrl = assertString(ex.avatarUrl, 'expert.avatarUrl', 512, false);
    const promptFile = assertString(ex.promptFile, 'expert.promptFile', 256) as string;
    const expertVersion = assertString(ex.version, 'expert.version', 32) as string;
    const sha256 = assertString(ex.sha256, 'expert.sha256', 64) as string;
    const expertType = assertString(ex.expertType, 'expert.expertType', 16) as string;
    const updatedAt = assertString(ex.updatedAt, 'expert.updatedAt', 40) as string;
    const suggestedTools = assertStringArray(
      ex.suggestedTools,
      'expert.suggestedTools',
      MAX_SUGGESTED_TOOLS,
      64,
    );
    const tags = assertStringArray(ex.tags, 'expert.tags', MAX_TAGS, 32);
    const quickPrompts = assertStringArray(
      ex.quickPrompts,
      'expert.quickPrompts',
      MAX_QUICK_PROMPTS,
      200,
    );
    const defaultInitPrompt = assertString(
      ex.defaultInitPrompt,
      'expert.defaultInitPrompt',
      500,
      false,
    );

    if (!SEMVER_RE.test(expertVersion))
      throw new ExpertHubError(`expert ${slug} version 非法`, 'invalid_manifest');
    if (!SHA256_RE.test(sha256))
      throw new ExpertHubError(`expert ${slug} sha256 非法`, 'invalid_manifest');
    if (expertType !== 'agent' && expertType !== 'team') {
      throw new ExpertHubError(
        `expert ${slug} expertType 非法（仅 agent|team）`,
        'invalid_manifest',
      );
    }
    // team 必须带 members；agent 禁止 members（避免歧义）
    const members = assertStringArray(ex.members, 'expert.members', MAX_TEAM_MEMBERS, 128);
    if (expertType === 'team' && (!members || members.length === 0)) {
      throw new ExpertHubError(`team 专家 ${slug} 缺少 members`, 'invalid_manifest');
    }
    if (expertType === 'agent' && members !== undefined) {
      throw new ExpertHubError(`agent 专家 ${slug} 不允许 members 字段`, 'invalid_manifest');
    }
    if (members) {
      const seen = new Set<string>();
      for (const m of members) {
        if (!SLUG_RE.test(m)) {
          throw new ExpertHubError(`team ${slug} 成员 slug 非法：${m}`, 'invalid_manifest');
        }
        if (m === slug) {
          throw new ExpertHubError(`team ${slug} 不能包含自身`, 'invalid_manifest');
        }
        if (seen.has(m)) {
          throw new ExpertHubError(`team ${slug} 成员重复：${m}`, 'invalid_manifest');
        }
        seen.add(m);
      }
    }
    if (!ISO_DATE_RE.test(updatedAt))
      throw new ExpertHubError(`expert ${slug} updatedAt 非法`, 'invalid_manifest');
    if (!RELATIVE_PATH_RE.test(promptFile)) {
      throw new ExpertHubError(`expert ${slug} promptFile 路径非法`, 'invalid_manifest');
    }
    if (avatarUrl !== undefined && !RELATIVE_PATH_RE.test(avatarUrl)) {
      throw new ExpertHubError(`expert ${slug} avatarUrl 路径非法`, 'invalid_manifest');
    }

    return {
      slug,
      categoryId,
      name,
      description,
      promptFile,
      version: expertVersion,
      sha256,
      expertType: expertType as 'agent' | 'team',
      updatedAt,
      ...(members !== undefined ? { members } : {}),
      ...(nameEn !== undefined ? { nameEn } : {}),
      ...(descriptionEn !== undefined ? { descriptionEn } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(suggestedTools !== undefined ? { suggestedTools } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(quickPrompts !== undefined ? { quickPrompts } : {}),
      ...(defaultInitPrompt !== undefined ? { defaultInitPrompt } : {}),
    };
  });

  // team 成员交叉校验：成员必须存在于 manifest 且为 agent 类型（禁止嵌套 team）
  const metaBySlug = new Map(experts.map((e) => [e.slug, e]));
  for (const e of experts) {
    if (!e.members) continue;
    for (const m of e.members) {
      const member = metaBySlug.get(m);
      if (!member) {
        throw new ExpertHubError(`team ${e.slug} 引用不存在的成员：${m}`, 'invalid_manifest');
      }
      if (member.expertType !== 'agent') {
        throw new ExpertHubError(`team ${e.slug} 成员必须为 agent 类型：${m}`, 'invalid_manifest');
      }
    }
  }

  return { version, lastUpdated, categories, experts };
}

/** sha256 摘要（Bun 内置，零第三方依赖） */
export function sha256Hex(data: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(data);
  return hasher.digest('hex');
}

/**
 * ed25519 manifest 签名校验。
 * @param manifestBytes manifest.json 的原始字节
 * @param sigHex        manifest.sig 内容（ed25519 签名的 hex 编码）
 * @param pubkeyHex     32 字节裸格式 ed25519 公钥（hex）
 */
export function verifyManifestSignature(
  manifestBytes: Uint8Array,
  sigHex: string,
  pubkeyHex: string,
): boolean {
  if (!/^[0-9a-f]{128}$/i.test(sigHex)) return false;
  if (!/^[0-9a-f]{64}$/i.test(pubkeyHex)) return false;
  const sig = Buffer.from(sigHex, 'hex');
  // 裸 32 字节公钥 → SPKI DER（ed25519 固定前缀 302a300506032b6570032100）
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(pubkeyHex, 'hex'),
  ]);
  const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  return cryptoVerify(null, manifestBytes, key, sig);
}

// ---- 服务 ----

export function createExpertHubService(deps: ExpertHubDeps = {}): ExpertHubService {
  const baseUrl = normalizeBaseUrl(deps.baseUrl ?? DEFAULT_HUB_BASE_URL);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ttl = deps.manifestCacheTtlMs ?? 5 * 60 * 1000;
  const signingPubkey = deps.signingPubkey?.trim() || undefined;

  let cache: { manifest: HubManifest; fetchedAt: number } | null = null;

  async function fetchText(relativePath: string, maxBytes: number): Promise<string> {
    const url = resolveUrl(relativePath);
    let resp: Response;
    try {
      resp = await fetchImpl(url, {
        headers: {
          Accept: 'application/json, text/markdown, text/plain',
          'User-Agent': USER_AGENT,
        },
      });
    } catch (err) {
      throw new ExpertHubError(
        `hub 网络错误：${err instanceof Error ? err.message : String(err)}`,
        'hub_network_error',
      );
    }
    if (!resp.ok) {
      throw new ExpertHubError(`hub 响应异常：${resp.status}`, 'hub_request_failed');
    }
    const contentLength = Number(resp.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      throw new ExpertHubError(`资源超限：${relativePath}`, 'hub_resource_too_large');
    }
    const text = await resp.text();
    if (text.length > maxBytes) {
      throw new ExpertHubError(`资源超限：${relativePath}`, 'hub_resource_too_large');
    }
    return text;
  }

  async function fetchManifestUncached(): Promise<HubManifest> {
    const text = await fetchText('manifest.json', MAX_MANIFEST_BYTES);

    // 可选 manifest 签名：配置公钥后 fail-closed（签名缺失/不符一律拒绝）
    if (signingPubkey) {
      const sigHex = await fetchText('manifest.sig', 512).catch(() => {
        throw new ExpertHubError('manifest 签名文件缺失（manifest.sig）', 'signature_missing');
      });
      const bytes = new TextEncoder().encode(text);
      if (!verifyManifestSignature(bytes, sigHex.trim(), signingPubkey)) {
        throw new ExpertHubError('manifest 签名校验失败', 'signature_invalid');
      }
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ExpertHubError('manifest JSON 解析失败', 'invalid_manifest');
    }
    return validateManifest(raw);
  }

  function normalizeBaseUrl(url: string): string {
    if (!/^https?:\/\//.test(url)) {
      throw new ExpertHubError('hub baseUrl 必须为 http(s) 地址', 'invalid_config');
    }
    return url.endsWith('/') ? url : `${url}/`;
  }

  function resolveUrl(relativePath: string): string {
    if (
      relativePath.includes('..') ||
      relativePath.startsWith('/') ||
      relativePath.includes('://')
    ) {
      throw new ExpertHubError(`非法相对路径：${relativePath}`, 'invalid_path');
    }
    return `${baseUrl}${relativePath}`;
  }

  return {
    baseUrl,

    async fetchManifest(force = false): Promise<HubManifest> {
      if (!force && cache && Date.now() - cache.fetchedAt < ttl) {
        return cache.manifest;
      }
      const manifest = await fetchManifestUncached();
      cache = { manifest, fetchedAt: Date.now() };
      return manifest;
    },

    async fetchPrompt(meta: HubExpertMeta): Promise<string> {
      const prompt = await fetchText(meta.promptFile, MAX_PROMPT_BYTES);
      const actual = sha256Hex(prompt);
      if (actual !== meta.sha256) {
        throw new ExpertHubError(`专家 ${meta.slug} 内容校验失败（sha256 不符）`, 'sha_mismatch');
      }
      return prompt;
    },

    resolveUrl(relativePath: string): string {
      return resolveUrl(relativePath);
    },
  };
}
