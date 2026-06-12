/**
 * Skill 商店类型定义
 */

/** 商店搜索结果项 */
export interface StoreSkillItem {
  slug: string;
  name: string;
  description: string;
  descriptionZh?: string;
  iconUrl: string | null;
  version: string;
  downloads: number;
  stars: number;
  source: string;
  ownerName: string;
  labels: Record<string, string>;
  score: number;
  verified: boolean;
}

/** 商店搜索结果 */
export interface StoreSearchResult {
  skills: StoreSkillItem[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Skill 详情（从商店获取） */
export interface StoreSkillDetail {
  slug: string;
  displayName: string;
  summary: string;
  summaryZh?: string;
  iconUrl: string | null;
  labels: Record<string, string>;
  source: string;
  verified: boolean;
  owner: {
    displayName: string;
    handle: string;
    image: string | null;
  };
  latestVersion: {
    version: string;
    changelog: string;
    createdAt: number;
  };
  stats: {
    downloads: number;
    stars: number;
    comments: number;
    versions: number;
  };
  securityReports?: {
    keen?: { status: string; statusText: string; reportUrl: string };
    sanbu?: { status: string; statusText: string; reportUrl: string };
  };
}

/** 文件树项 */
export interface SkillFileEntry {
  path: string;
  sha256: string;
  size: number;
}

/** 评估报告 */
export interface SkillEvaluation {
  createdAt: number;
  dimensions: Record<string, {
    score: number;
    reason: string;
    userReason?: string;
    items?: Record<string, { score: number; reason: string; userReason?: string }>;
  }>;
}

/** 推荐项 */
export interface SkillRecommendation {
  slug: string;
  displayName: string;
  summary: string;
  summaryZh?: string;
  iconUrl: string | null;
  downloads: number;
  stars: number;
}

/** 已安装 Skill */
export interface InstalledSkill {
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
  fileTree: SkillFileEntry[] | null;
  skillMdContent: string | null;
  readmeContent: string | null;
  evaluation: SkillEvaluation | null;
  securityReports: Record<string, unknown> | null;
  labels: Record<string, string> | null;
  stats: Record<string, number> | null;
  owner: Record<string, unknown> | null;
  enabled: boolean;
  installedAt: string | null;
  lastSyncedAt: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillStoreService {
  /** 搜索商店 */
  searchStore(keyword: string, page?: number, pageSize?: number): Promise<StoreSearchResult>;
  /** 获取商店详情 */
  getStoreDetail(slug: string): Promise<StoreSkillDetail>;
  /** 获取文件树 */
  getFiles(slug: string, version: string): Promise<SkillFileEntry[]>;
  /** 获取文件内容 */
  getFileContent(slug: string, path: string, version: string): Promise<string>;
  /** 安装 skill */
  install(slug: string, tenantId: string): Promise<InstalledSkill>;
  /** 上传 zip 安装 */
  installFromZip(zipBuffer: ArrayBuffer, tenantId: string): Promise<InstalledSkill>;
  /** 同步更新 */
  sync(skillId: string, tenantId: string): Promise<InstalledSkill>;
  /** 批量检查更新 */
  checkUpdates(tenantId: string): Promise<Array<{ id: string; slug: string; installed: string; latest: string }>>;
  /** 已安装列表 */
  listInstalled(tenantId: string): Promise<InstalledSkill[]>;
  /** 获取已安装详情 */
  getInstalled(id: string, tenantId: string): Promise<InstalledSkill | null>;
  /** 启用/禁用 */
  setEnabled(id: string, enabled: boolean, tenantId: string): Promise<void>;
  /** 卸载 */
  uninstall(id: string, tenantId: string): Promise<void>;
}
