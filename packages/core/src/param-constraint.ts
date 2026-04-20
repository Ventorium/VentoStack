// @aeron/core - 路由参数类型约束

export interface ParamConstraint {
  pattern: RegExp;
  message?: string;
}

export const paramConstraints = {
  /** 数字 ID */
  id: { pattern: /^\d+$/, message: "Must be a numeric ID" } satisfies ParamConstraint,
  /** UUID v4 */
  uuid: { pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, message: "Must be a valid UUID" } satisfies ParamConstraint,
  /** slug */
  slug: { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: "Must be a valid slug" } satisfies ParamConstraint,
  /** 非空字符串 */
  nonEmpty: { pattern: /^.+$/, message: "Must not be empty" } satisfies ParamConstraint,
  /** 数字(整数或浮点数) */
  numeric: { pattern: /^-?\d+(\.\d+)?$/, message: "Must be numeric" } satisfies ParamConstraint,
} as const;

export type BuiltinConstraint = keyof typeof paramConstraints;

export interface RouteParamValidator {
  validate(params: Record<string, string>, constraints: Record<string, ParamConstraint | BuiltinConstraint>): { valid: boolean; errors: Array<{ param: string; value: string; message: string }> };
}

export function createParamValidator(): RouteParamValidator {
  return {
    validate(params, constraints) {
      const errors: Array<{ param: string; value: string; message: string }> = [];

      for (const [param, constraint] of Object.entries(constraints)) {
        const value = params[param];
        if (value === undefined) continue;

        const resolved: ParamConstraint =
          typeof constraint === "string"
            ? paramConstraints[constraint]
            : constraint;

        if (!resolved.pattern.test(value)) {
          errors.push({
            param,
            value,
            message: resolved.message ?? `Parameter "${param}" does not match constraint`,
          });
        }
      }

      return { valid: errors.length === 0, errors };
    },
  };
}
