// @aeron/auth - 策略引擎

export interface PolicyRule {
  effect: "allow" | "deny";
  subjects: string[];
  resources: string[];
  actions: string[];
  conditions?: PolicyConditionDef[];
}

export interface PolicyConditionDef {
  field: string;
  operator: "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte" | "matches";
  value: unknown;
}

export interface PolicyEvalContext {
  subject: string;
  resource: string;
  action: string;
  attributes?: Record<string, unknown>;
}

export interface PolicyEngine {
  addRule(rule: PolicyRule): void;
  removeRule(index: number): boolean;
  evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule };
  getRules(): PolicyRule[];
  clear(): void;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(value);
  }
  return value === pattern;
}

function evaluateCondition(condition: PolicyConditionDef, attributes: Record<string, unknown>): boolean {
  const fieldValue = attributes[condition.field];

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    case "gt":
      return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue > condition.value;
    case "lt":
      return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue < condition.value;
    case "gte":
      return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue >= condition.value;
    case "lte":
      return typeof fieldValue === "number" && typeof condition.value === "number" && fieldValue <= condition.value;
    case "matches":
      return typeof fieldValue === "string" && typeof condition.value === "string" && new RegExp(condition.value).test(fieldValue);
    default:
      return false;
  }
}

/**
 * 创建策略引擎
 * 支持类 Casbin 的策略模型：subject, resource, action + conditions
 * 默认 deny，只有匹配 allow 规则且无 deny 规则时才允许
 */
export function createPolicyEngine(): PolicyEngine {
  const rules: PolicyRule[] = [];

  return {
    addRule(rule: PolicyRule): void {
      rules.push(rule);
    },

    removeRule(index: number): boolean {
      if (index < 0 || index >= rules.length) return false;
      rules.splice(index, 1);
      return true;
    },

    evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule } {
      let allowed = false;
      let matchedRule: PolicyRule | undefined;

      for (const rule of rules) {
        // 匹配 subject
        const subjectMatch = rule.subjects.some((s) => matchesPattern(ctx.subject, s));
        if (!subjectMatch) continue;

        // 匹配 resource
        const resourceMatch = rule.resources.some((r) => matchesPattern(ctx.resource, r));
        if (!resourceMatch) continue;

        // 匹配 action
        const actionMatch = rule.actions.some((a) => matchesPattern(ctx.action, a));
        if (!actionMatch) continue;

        // 匹配条件
        if (rule.conditions && ctx.attributes) {
          const conditionsMatch = rule.conditions.every((c) => evaluateCondition(c, ctx.attributes!));
          if (!conditionsMatch) continue;
        } else if (rule.conditions && !ctx.attributes) {
          continue;
        }

        // deny 优先
        if (rule.effect === "deny") {
          return { allowed: false, matchedRule: rule };
        }

        if (rule.effect === "allow") {
          allowed = true;
          matchedRule = rule;
        }
      }

      return { allowed, matchedRule };
    },

    getRules(): PolicyRule[] {
      return [...rules];
    },

    clear(): void {
      rules.length = 0;
    },
  };
}
