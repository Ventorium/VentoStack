// @aeron/openapi - 旧版本兼容与废弃通知 + 向后兼容策略

export interface DeprecationNotice {
  path: string;
  method: string;
  version: string;
  sunsetDate?: string;
  replacement?: string;
  message?: string;
}

export interface DeprecationManager {
  deprecate(notice: DeprecationNotice): void;
  isDeprecated(method: string, path: string): DeprecationNotice | undefined;
  list(): DeprecationNotice[];
  /** 生成 Sunset / Deprecation headers */
  headers(method: string, path: string): Record<string, string>;
  /** 检查是否已过 sunset 日期 */
  isSunset(method: string, path: string): boolean;
  /** 生成废弃通知文档 */
  report(): string;
}

/**
 * 创建废弃管理器
 */
export function createDeprecationManager(): DeprecationManager {
  const notices: DeprecationNotice[] = [];

  function find(method: string, path: string): DeprecationNotice | undefined {
    return notices.find(
      (n) => n.method.toUpperCase() === method.toUpperCase() && n.path === path,
    );
  }

  return {
    deprecate(notice: DeprecationNotice): void {
      // 去重
      const existing = find(notice.method, notice.path);
      if (existing) {
        Object.assign(existing, notice);
      } else {
        notices.push(notice);
      }
    },

    isDeprecated(method: string, path: string): DeprecationNotice | undefined {
      return find(method, path);
    },

    list(): DeprecationNotice[] {
      return [...notices];
    },

    headers(method: string, path: string): Record<string, string> {
      const notice = find(method, path);
      if (!notice) return {};

      const headers: Record<string, string> = {
        Deprecation: "true",
      };

      if (notice.sunsetDate) {
        headers["Sunset"] = new Date(notice.sunsetDate).toUTCString();
      }

      if (notice.replacement) {
        headers["Link"] = `<${notice.replacement}>; rel="successor-version"`;
      }

      return headers;
    },

    isSunset(method: string, path: string): boolean {
      const notice = find(method, path);
      if (!notice?.sunsetDate) return false;
      return new Date(notice.sunsetDate).getTime() < Date.now();
    },

    report(): string {
      const lines: string[] = [];
      lines.push("# Deprecated APIs\n");

      if (notices.length === 0) {
        lines.push("No deprecated APIs.\n");
        return lines.join("\n");
      }

      lines.push("| Method | Path | Since | Sunset | Replacement | Notes |");
      lines.push("|--------|------|-------|--------|-------------|-------|");

      for (const n of notices) {
        lines.push(
          `| ${n.method.toUpperCase()} | ${n.path} | ${n.version} | ${n.sunsetDate ?? "N/A"} | ${n.replacement ?? "N/A"} | ${n.message ?? ""} |`,
        );
      }

      return lines.join("\n");
    },
  };
}

// 向后兼容策略
export interface CompatibilityPolicy {
  /** 版本兼容窗口（保留多少个旧版本） */
  versionWindow: number;
  /** 废弃后保留时间（天） */
  sunsetDays: number;
  /** 是否强制返回废弃 headers */
  enforceHeaders: boolean;
  /** 是否在 sunset 后拒绝请求 */
  blockAfterSunset: boolean;
}

export const DEFAULT_COMPATIBILITY_POLICY: CompatibilityPolicy = {
  versionWindow: 2,
  sunsetDays: 90,
  enforceHeaders: true,
  blockAfterSunset: false,
};

/**
 * 创建兼容性策略中间件参数
 */
export function createCompatibilityGuard(
  deprecationManager: DeprecationManager,
  policy: Partial<CompatibilityPolicy> = {},
): {
  check(method: string, path: string): { allowed: boolean; headers: Record<string, string>; warning?: string };
} {
  const p = { ...DEFAULT_COMPATIBILITY_POLICY, ...policy };

  return {
    check(method: string, path: string) {
      const notice = deprecationManager.isDeprecated(method, path);
      if (!notice) {
        return { allowed: true, headers: {} };
      }

      const headers = p.enforceHeaders ? deprecationManager.headers(method, path) : {};
      const isSunset = deprecationManager.isSunset(method, path);

      if (isSunset && p.blockAfterSunset) {
        return {
          allowed: false,
          headers,
          warning: `API ${method} ${path} has been sunset since ${notice.sunsetDate}. Use ${notice.replacement ?? "a newer version"} instead.`,
        };
      }

      return {
        allowed: true,
        headers,
        warning: notice.message ?? `API ${method} ${path} is deprecated since ${notice.version}.`,
      };
    },
  };
}
