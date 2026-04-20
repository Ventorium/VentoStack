// @aeron/auth - 资源级权限细控（数据行过滤）

export interface RowFilterRule {
  /** 资源/表名 */
  resource: string;
  /** 过滤条件字段 */
  field: string;
  /** 操作符 */
  operator: "eq" | "in" | "neq" | "not_in";
  /** 值来源 */
  valueFrom: "user" | "tenant" | "static";
  /** 静态值或属性路径 */
  value: string;
}

export interface RowFilterContext {
  userId?: string;
  tenantId?: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
}

export interface RowFilter {
  addRule(rule: RowFilterRule): void;
  getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[];
  getRules(): RowFilterRule[];
  buildWhereClause(resource: string, ctx: RowFilterContext): string;
}

export interface RowFilterClause {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * 创建行级数据过滤器
 * 根据用户/租户上下文自动生成 WHERE 条件
 */
export function createRowFilter(): RowFilter {
  const rules: RowFilterRule[] = [];

  function resolveValue(rule: RowFilterRule, ctx: RowFilterContext): unknown {
    switch (rule.valueFrom) {
      case "user":
        return ctx.userId ?? ctx.attributes?.[rule.value];
      case "tenant":
        return ctx.tenantId ?? ctx.attributes?.[rule.value];
      case "static":
        return rule.value;
      default:
        return rule.value;
    }
  }

  function toSqlOperator(op: RowFilterRule["operator"]): string {
    switch (op) {
      case "eq":
        return "=";
      case "neq":
        return "!=";
      case "in":
        return "IN";
      case "not_in":
        return "NOT IN";
    }
  }

  return {
    addRule(rule: RowFilterRule): void {
      rules.push(rule);
    },

    getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[] {
      return rules
        .filter((r) => r.resource === resource || r.resource === "*")
        .map((r) => ({
          field: r.field,
          operator: toSqlOperator(r.operator),
          value: resolveValue(r, ctx),
        }));
    },

    getRules(): RowFilterRule[] {
      return [...rules];
    },

    buildWhereClause(resource: string, ctx: RowFilterContext): string {
      const filters = this.getFilters(resource, ctx);
      if (filters.length === 0) return "";

      const conditions = filters.map((f) => {
        if (f.operator === "IN" || f.operator === "NOT IN") {
          const vals = Array.isArray(f.value) ? f.value : [f.value];
          return `${f.field} ${f.operator} (${vals.map((v) => `'${String(v)}'`).join(", ")})`;
        }
        return `${f.field} ${f.operator} '${String(f.value)}'`;
      });

      return `WHERE ${conditions.join(" AND ")}`;
    },
  };
}
