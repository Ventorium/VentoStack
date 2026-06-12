/**
 * Skill 商店服务 — 对接 skillhub.cn API
 * 负责搜索、查看详情、下载安装、版本同步
 * 所有远程数据缓存到本地 DB，避免重复请求
 */

const SKILLHUB_API = "https://api.skillhub.cn";
const CDN_BASE = "https://skillhub-1388575217.cos.accelerate.myqcloud.com";

// ---- Types ----

export interface StoreSearchResult {
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  version: string;
  downloads: number;
  stars: number;
  ownerName: string;
  source: string;
  labels: Record<string, string> | null;
  score: number;
  updatedAt: number;
}

export interface StoreSkillDetail {
  slug: string;
  displayName: string;
  summary: string;
  iconUrl: string | null;
  labels: Record<string, string>;
  source: string;
  stats: {
    downloads: number;
    stars: number;
    versions: number;
    comments: number;
  };
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
  securityReports: Record<string, { status: string; statusText: string; reportUrl: string }>;
  tags: Record<string, string>;
  contest?: {
    contestName: string;
    seasonNumber: number;
    status: string;
    trasceScore: number;
  };
}

export interface StoreFileItem {
  path: string;
  sha256: string;
  size: number;
}

export interface StoreEvaluation {
  createdAt: number;
  dimensions: Record<string, {
    reason: string;
    userReason: string;
    score: number;
    items?: Record<string, { reason: string; userReason: string; score: number }>;
  }>;
}

export interface StoreRecommendation {
  slug: string;
  displayName: string;
  summary: string;
  iconUrl: string | null;
  downloads: number;
  stars: number;
}

export interface SkillStoreService {
  search(keyword: string, page?: number, pageSize?: number): Promise<{ skills: StoreSearchResult[]; hasMore: boolean; nextCursor: string | null }>;
  getDetail(slug: string): Promise<StoreSkillDetail>;
  getFiles(slug: string, version: string): Promise<StoreFileItem[]>;
  getFileContent(slug: string, path: string, version: string): Promise<string>;
  getEvaluation(slug: string): Promise<StoreEvaluation | null>;
  getRecommendations(slug: string, pageSize?: number): Promise<StoreRecommendation[]>;
  getDownloadUrl(slug: string, version: string): string;
  downloadZip(slug: string, version: string): Promise<Buffer>;
}

export function createSkillStoreService(): SkillStoreService {
  async function fetchJSON<T>(url: string): Promise<T> {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "VentoStack/1.0" },
    });
    if (!resp.ok) {
      throw new Error(`SkillHub API error: ${resp.status} ${resp.statusText} for ${url}`);
    }
    return resp.json() as Promise<T>;
  }

  async function search(
    keyword: string,
    page: number = 1,
    pageSize: number = 24,
  ): Promise<{ skills: StoreSearchResult[]; hasMore: boolean; nextCursor: string | null }> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: "score",
      order: "desc",
    });
    if (keyword) params.set("keyword", keyword);

    const data = await fetchJSON<{ code: number; data: { skills: unknown[]; hasMore?: boolean; nextCursor?: string } }>(
      `${SKILLHUB_API}/api/skills?${params}`,
    );

    const skills: StoreSearchResult[] = (data.data?.skills ?? []).map((s: Record<string, unknown>) => ({
      slug: s.slug as string,
      name: s.name as string,
      description: s.description as string,
      iconUrl: (s.iconUrl as string) ?? null,
      version: s.version as string,
      downloads: Number(s.downloads ?? 0),
      stars: Number(s.stars ?? 0),
      ownerName: s.ownerName as string,
      source: s.source as string,
      labels: (s.labels as Record<string, string>) ?? null,
      score: Number(s.score ?? 0),
      updatedAt: Number(s.updated_at ?? 0),
    }));

    return {
      skills,
      hasMore: data.data?.hasMore ?? false,
      nextCursor: data.data?.nextCursor ?? null,
    };
  }

  async function getDetail(slug: string): Promise<StoreSkillDetail> {
    const data = await fetchJSON<Record<string, unknown>>(
      `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}`,
    );

    const skill = data.skill as Record<string, unknown>;
    const latestVersion = data.latestVersion as Record<string, unknown>;
    const owner = data.owner as Record<string, unknown>;
    const stats = skill.stats as Record<string, unknown>;

    return {
      slug: skill.slug as string,
      displayName: skill.displayName as string,
      summary: (skill.summary as string) ?? "",
      iconUrl: (skill.iconUrl as string) ?? null,
      labels: (skill.labels as Record<string, string>) ?? {},
      source: (skill.source as string) ?? "community",
      stats: {
        downloads: Number(stats?.downloads ?? 0),
        stars: Number(stats?.stars ?? 0),
        versions: Number(stats?.versions ?? 0),
        comments: Number(stats?.comments ?? 0),
      },
      owner: {
        displayName: (owner?.displayName as string) ?? "",
        handle: (owner?.handle as string) ?? "",
        image: (owner?.image as string) ?? null,
      },
      latestVersion: {
        version: (latestVersion?.version as string) ?? "",
        changelog: (latestVersion?.changelog as string) ?? "",
        createdAt: Number(latestVersion?.createdAt ?? 0),
      },
      securityReports: (data.securityReports as Record<string, { status: string; statusText: string; reportUrl: string }>) ?? {},
      tags: (skill.tags as Record<string, string>) ?? {},
      contest: data.contest as StoreSkillDetail["contest"],
    };
  }

  async function getFiles(slug: string, version: string): Promise<StoreFileItem[]> {
    const data = await fetchJSON<{ files: unknown[] }>(
      `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}/files?version=${encodeURIComponent(version)}`,
    );
    return (data.files ?? []).map((f: Record<string, unknown>) => ({
      path: f.path as string,
      sha256: f.sha256 as string,
      size: Number(f.size ?? 0),
    }));
  }

  async function getFileContent(slug: string, path: string, version: string): Promise<string> {
    const url = `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}&version=${encodeURIComponent(version)}`;
    const resp = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "VentoStack/1.0" },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch file: ${resp.status}`);
    }
    return resp.text();
  }

  async function getEvaluation(slug: string): Promise<StoreEvaluation | null> {
    try {
      const data = await fetchJSON<Record<string, unknown>>(
        `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}/evaluation`,
      );
      return {
        createdAt: Number(data.createdAt ?? 0),
        dimensions: (data.dimensions as StoreEvaluation["dimensions"]) ?? {},
      };
    } catch {
      return null;
    }
  }

  async function getRecommendations(slug: string, pageSize: number = 3): Promise<StoreRecommendation[]> {
    const data = await fetchJSON<{ items: unknown[] }>(
      `${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}/recommendations?pageSize=${pageSize}`,
    );
    return (data.items ?? []).map((r: Record<string, unknown>) => ({
      slug: r.slug as string,
      displayName: r.displayName as string,
      summary: (r.summaryZh as string) ?? (r.summary as string) ?? "",
      iconUrl: (r.iconUrl as string) ?? null,
      downloads: Number(r.downloads ?? 0),
      stars: Number(r.stars ?? 0),
    }));
  }

  function getDownloadUrl(slug: string, version: string): string {
    return `${CDN_BASE}/skills/${encodeURIComponent(slug)}/${encodeURIComponent(version)}.zip`;
  }

  async function downloadZip(slug: string, version: string): Promise<Buffer> {
    const url = getDownloadUrl(slug, version);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Download failed: ${resp.status} for ${url}`);
    }
    return Buffer.from(await resp.arrayBuffer());
  }

  return { search, getDetail, getFiles, getFileContent, getEvaluation, getRecommendations, getDownloadUrl, downloadZip };
}
