// @aeron/observability - 审计日志查询与导出

import type { AuditEntry, AuditStore } from "./audit";

export interface AuditExporter {
  /** 导出为 CSV 字符串 */
  toCSV(entries: AuditEntry[]): string;
  /** 导出为 JSON Lines 格式 */
  toJSONL(entries: AuditEntry[]): string;
  /** 分页查询 */
  queryPaginated(
    store: AuditStore,
    filter: {
      actor?: string;
      action?: string;
      resource?: string;
      from?: number;
      to?: number;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }>;
}

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function createAuditExporter(): AuditExporter {
  return {
    toCSV(entries) {
      const headers = [
        "id",
        "timestamp",
        "actor",
        "action",
        "resource",
        "resourceId",
        "result",
        "hash",
      ];
      const lines = [headers.join(",")];

      for (const entry of entries) {
        const row = [
          escapeCSVField(entry.id),
          new Date(entry.timestamp).toISOString(),
          escapeCSVField(entry.actor),
          escapeCSVField(entry.action),
          escapeCSVField(entry.resource),
          escapeCSVField(entry.resourceId ?? ""),
          entry.result,
          entry.hash,
        ];
        lines.push(row.join(","));
      }

      return lines.join("\n");
    },

    toJSONL(entries) {
      return entries.map((e) => JSON.stringify(e)).join("\n");
    },

    async queryPaginated(store, filter) {
      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 50;

      // 获取全部匹配记录
      const all = await store.query({
        actor: filter.actor,
        action: filter.action,
        resource: filter.resource,
        from: filter.from,
        to: filter.to,
      });

      const total = all.length;
      const start = (page - 1) * pageSize;
      const entries = all.slice(start, start + pageSize);

      return { entries, total, page, pageSize };
    },
  };
}
