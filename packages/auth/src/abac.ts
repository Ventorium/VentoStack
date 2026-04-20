// @aeron/auth - 基于属性的访问控制 (ABAC)
// 默认 deny，deny 策略优先于 allow

export type PolicyCondition = (
  subject: Record<string, unknown>,
  resource: Record<string, unknown>,
  context?: Record<string, unknown>,
) => boolean;

export interface Policy {
  name: string;
  effect: "allow" | "deny";
  condition: PolicyCondition;
}

export interface ABAC {
  addPolicy(policy: Policy): void;
  removePolicy(name: string): boolean;
  evaluate(
    subject: Record<string, unknown>,
    resource: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): { allowed: boolean; matchedPolicies: string[] };
  listPolicies(): Policy[];
}

export function createABAC(): ABAC {
  const policies = new Map<string, Policy>();

  return {
    addPolicy(policy: Policy): void {
      policies.set(policy.name, {
        name: policy.name,
        effect: policy.effect,
        condition: policy.condition,
      });
    },

    removePolicy(name: string): boolean {
      return policies.delete(name);
    },

    evaluate(
      subject: Record<string, unknown>,
      resource: Record<string, unknown>,
      context?: Record<string, unknown>,
    ): { allowed: boolean; matchedPolicies: string[] } {
      const matchedPolicies: string[] = [];
      let hasAllow = false;
      let hasDeny = false;

      for (const policy of policies.values()) {
        if (policy.condition(subject, resource, context)) {
          matchedPolicies.push(policy.name);
          if (policy.effect === "deny") {
            hasDeny = true;
          } else if (policy.effect === "allow") {
            hasAllow = true;
          }
        }
      }

      // deny 优先；无匹配策略 = 拒绝
      const allowed = !hasDeny && hasAllow;

      return { allowed, matchedPolicies };
    },

    listPolicies(): Policy[] {
      return Array.from(policies.values()).map((p) => ({
        name: p.name,
        effect: p.effect,
        condition: p.condition,
      }));
    },
  };
}
