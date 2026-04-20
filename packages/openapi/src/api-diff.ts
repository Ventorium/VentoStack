// @aeron/openapi - 接口变更 Diff

export interface APIDiffEntry {
  type: "added" | "removed" | "modified" | "deprecated";
  path: string;
  method: string;
  description?: string;
  breaking: boolean;
  details?: Record<string, unknown>;
}

export interface APIDiffResult {
  entries: APIDiffEntry[];
  hasBreaking: boolean;
  summary: { added: number; removed: number; modified: number; deprecated: number };
}

/**
 * 计算两个 OpenAPI spec 之间的 Diff
 */
export function computeAPIDiff(
  oldSpec: Record<string, unknown>,
  newSpec: Record<string, unknown>,
): APIDiffResult {
  const entries: APIDiffEntry[] = [];
  const oldPaths = (oldSpec as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};
  const newPaths = (newSpec as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};

  const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];

  // 检查新增和修改
  for (const [path, methods] of Object.entries(newPaths)) {
    if (typeof methods !== "object" || methods === null) continue;
    for (const method of httpMethods) {
      const newOp = methods[method] as Record<string, unknown> | undefined;
      if (!newOp) continue;

      const oldPathMethods = oldPaths[path];
      const oldOp = oldPathMethods?.[method] as Record<string, unknown> | undefined;

      if (!oldOp) {
        entries.push({
          type: "added",
          path,
          method: method.toUpperCase(),
          description: newOp.summary as string | undefined,
          breaking: false,
        });
      } else {
        // 检查 deprecated
        if (newOp.deprecated === true && oldOp.deprecated !== true) {
          entries.push({
            type: "deprecated",
            path,
            method: method.toUpperCase(),
            description: newOp.summary as string | undefined,
            breaking: false,
          });
        }
        // 检查参数变更
        if (JSON.stringify(oldOp) !== JSON.stringify(newOp)) {
          const breaking = hasBreakingChange(oldOp, newOp);
          entries.push({
            type: "modified",
            path,
            method: method.toUpperCase(),
            description: newOp.summary as string | undefined,
            breaking,
          });
        }
      }
    }
  }

  // 检查删除
  for (const [path, methods] of Object.entries(oldPaths)) {
    if (typeof methods !== "object" || methods === null) continue;
    for (const method of httpMethods) {
      const oldOp = methods[method];
      if (!oldOp) continue;
      const newPathMethods = newPaths[path];
      if (!newPathMethods || !newPathMethods[method]) {
        entries.push({
          type: "removed",
          path,
          method: method.toUpperCase(),
          description: (oldOp as Record<string, unknown>).summary as string | undefined,
          breaking: true,
        });
      }
    }
  }

  return {
    entries,
    hasBreaking: entries.some((e) => e.breaking),
    summary: {
      added: entries.filter((e) => e.type === "added").length,
      removed: entries.filter((e) => e.type === "removed").length,
      modified: entries.filter((e) => e.type === "modified").length,
      deprecated: entries.filter((e) => e.type === "deprecated").length,
    },
  };
}

/**
 * 检测是否有破坏性变更
 */
function hasBreakingChange(oldOp: Record<string, unknown>, newOp: Record<string, unknown>): boolean {
  // 新增必填参数是破坏性变更
  const oldParams = (oldOp.parameters ?? []) as Array<{ name: string; required?: boolean }>;
  const newParams = (newOp.parameters ?? []) as Array<{ name: string; required?: boolean }>;

  for (const np of newParams) {
    if (!np.required) continue;
    const exists = oldParams.find((op) => op.name === np.name);
    if (!exists) return true; // 新增必填参数
  }

  // 响应格式变更（简化检测）
  if (JSON.stringify(oldOp.responses) !== JSON.stringify(newOp.responses)) {
    // 检查主要成功响应是否变更
    const oldResp = (oldOp.responses as Record<string, unknown>)?.["200"];
    const newResp = (newOp.responses as Record<string, unknown>)?.["200"];
    if (oldResp && newResp && JSON.stringify(oldResp) !== JSON.stringify(newResp)) {
      return true;
    }
  }

  return false;
}

/**
 * 生成 Diff 报告（Markdown）
 */
export function generateDiffReport(diff: APIDiffResult): string {
  const lines: string[] = [];
  lines.push("# API Diff Report\n");

  if (diff.hasBreaking) {
    lines.push("⚠️ **Breaking changes detected!**\n");
  }

  lines.push(`## Summary`);
  lines.push(`- Added: ${diff.summary.added}`);
  lines.push(`- Removed: ${diff.summary.removed}`);
  lines.push(`- Modified: ${diff.summary.modified}`);
  lines.push(`- Deprecated: ${diff.summary.deprecated}`);
  lines.push("");

  if (diff.entries.length > 0) {
    lines.push("## Changes\n");
    lines.push("| Type | Method | Path | Breaking | Description |");
    lines.push("|------|--------|------|----------|-------------|");
    for (const entry of diff.entries) {
      lines.push(
        `| ${entry.type} | ${entry.method} | ${entry.path} | ${entry.breaking ? "⚠️ Yes" : "No"} | ${entry.description ?? ""} |`,
      );
    }
  }

  return lines.join("\n");
}
