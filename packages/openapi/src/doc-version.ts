// @aeron/openapi - 文档版本管理

export interface DocVersion {
  version: string;
  date: string;
  description?: string;
  spec: Record<string, unknown>;
}

export interface DocVersionManager {
  addVersion(version: string, spec: Record<string, unknown>, description?: string): void;
  getVersion(version: string): DocVersion | undefined;
  getLatest(): DocVersion | undefined;
  list(): DocVersion[];
  compare(v1: string, v2: string): VersionDiff | undefined;
}

export interface VersionDiff {
  from: string;
  to: string;
  added: string[];
  removed: string[];
  modified: string[];
}

/**
 * 创建文档版本管理器
 */
export function createDocVersionManager(): DocVersionManager {
  const versions: DocVersion[] = [];

  function extractPaths(spec: Record<string, unknown>): Set<string> {
    const paths = (spec as { paths?: Record<string, unknown> }).paths ?? {};
    const result = new Set<string>();
    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods === "object" && methods !== null) {
        for (const method of Object.keys(methods)) {
          result.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    return result;
  }

  return {
    addVersion(version: string, spec: Record<string, unknown>, description?: string): void {
      versions.push({
        version,
        date: new Date().toISOString(),
        description,
        spec,
      });
    },

    getVersion(version: string): DocVersion | undefined {
      return versions.find((v) => v.version === version);
    },

    getLatest(): DocVersion | undefined {
      return versions.length > 0 ? versions[versions.length - 1] : undefined;
    },

    list(): DocVersion[] {
      return [...versions];
    },

    compare(v1: string, v2: string): VersionDiff | undefined {
      const doc1 = versions.find((v) => v.version === v1);
      const doc2 = versions.find((v) => v.version === v2);
      if (!doc1 || !doc2) return undefined;

      const paths1 = extractPaths(doc1.spec);
      const paths2 = extractPaths(doc2.spec);

      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];

      for (const p of paths2) {
        if (!paths1.has(p)) added.push(p);
      }
      for (const p of paths1) {
        if (!paths2.has(p)) removed.push(p);
      }
      // 简单变更检测：在两边都存在的路径，比较 JSON
      for (const p of paths1) {
        if (paths2.has(p)) {
          const [method, path] = p.split(" ", 2);
          const spec1Paths = (doc1.spec as { paths: Record<string, Record<string, unknown>> }).paths;
          const spec2Paths = (doc2.spec as { paths: Record<string, Record<string, unknown>> }).paths;
          const m = method.toLowerCase();
          if (
            spec1Paths[path] && spec2Paths[path] &&
            JSON.stringify(spec1Paths[path][m]) !== JSON.stringify(spec2Paths[path][m])
          ) {
            modified.push(p);
          }
        }
      }

      return { from: v1, to: v2, added, removed, modified };
    },
  };
}
