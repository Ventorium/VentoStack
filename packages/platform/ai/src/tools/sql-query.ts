/**
 * SQL 查询工具 — v1.1 阶段
 * 安全的 Text-to-SQL 查询能力
 * 安全措施：SQL 静态分析（去注释、CTE 检测、LIMIT 上限）、只读连接
 */
import type { Database } from "@ventostack/database";

export interface SQLQueryToolDeps {
  db: Database;
  tenantId: string;
  /** 最大返回行数 */
  maxRows?: number;
}

/** 危险 SQL 关键词 */
const DANGEROUS_KEYWORDS = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

/** CTE 中的写操作检测 */
const CTE_WRITE_PATTERN = /\bWITH\b.*\b(INSERT|UPDATE|DELETE)\b/i;

/** 多语句检测，避免 SELECT 后拼接额外语句 */
const MULTI_STATEMENT_PATTERN = /;\s*\S/;

export function createSQLQueryTool(deps: SQLQueryToolDeps) {
  const { db, tenantId } = deps;
  const maxRows = deps.maxRows ?? 100;

  return {
    name: "sql-query",
    description: "执行只读 SQL 查询。自动注入 tenant_id 过滤，禁止写操作。",
    parameters: [
      {
        name: "sql",
        type: "string" as const,
        description: "SELECT SQL 查询语句",
        required: true,
      },
      {
        name: "limit",
        type: "number" as const,
        description: "最大返回行数，默认 100",
        required: false,
      },
    ],
    riskLevel: "high" as const,
    requiresApproval: true,
    async handler(params: Record<string, unknown>): Promise<{ rows: unknown[]; rowCount: number } | { error: string }> {
      const sql = (params.sql as string)?.trim();
      if (!sql) return { error: "SQL 不能为空" };

      // 1. 去除注释
      const cleanSql = sql
        .replace(/--.*$/gm, "")  // 行注释
        .replace(/\/\*[\s\S]*?\*\//g, "")  // 块注释
        .trim();

      // 2. 只允许 SELECT
      if (!/^\s*SELECT\b/i.test(cleanSql)) {
        return { error: "仅允许 SELECT 查询" };
      }

      // 3. 危险关键词检测
      if (DANGEROUS_KEYWORDS.test(cleanSql)) {
        return { error: "SQL 包含不允许的关键词" };
      }

      // 4. CTE 写操作检测
      if (CTE_WRITE_PATTERN.test(cleanSql)) {
        return { error: "CTE 中不允许写操作" };
      }

      if (MULTI_STATEMENT_PATTERN.test(cleanSql)) {
        return { error: "不允许多语句 SQL" };
      }

      // 5. 安全防护：检查括号匹配，防止通过闭合包装子查询绕过租户过滤
      // 攻击向量: `SELECT * FROM users) WHERE 1=1 --` 会闭合外层子查询
      // 防御: 确保 user SQL 中的 ( 和 ) 数量一致，避免 ) 闭合我们的 (
      const openParens = (cleanSql.match(/\(/g) || []).length;
      const closeParens = (cleanSql.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        return { error: "SQL 中括号不匹配，可能存在注入风险" };
      }

      // 额外检查：禁止用户 SQL 以 ) 结尾（会被用作闭合我们的外层子查询）
      if (/\)\s*$/.test(cleanSql)) {
        return { error: "SQL 不能以右括号结尾" };
      }

      // 6. 强制 LIMIT 上限
      const requestedLimit = Math.min(
        (params.limit as number) ?? maxRows,
        maxRows,
      );
      const normalizedSql = cleanSql.replace(/;\s*$/, "");
      let finalSql = `SELECT * FROM (${normalizedSql}) AS ai_tenant_scope WHERE tenant_id = $1`;
      if (!/\bLIMIT\b/i.test(normalizedSql)) finalSql = `${finalSql} LIMIT ${requestedLimit}`;

      try {
        const rows = await db.raw(finalSql, [tenantId]) as unknown[];
        return { rows, rowCount: rows.length };
      } catch (err) {
        return { error: `查询失败: ${err instanceof Error ? err.message : "未知错误"}` };
      }
    },
  };
}
