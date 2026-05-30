/**
 * 密码策略校验
 *
 * 根据 sys_config 中的 sys_password_min_length 和 sys_password_complexity 校验密码。
 */

export type PasswordComplexity = "low" | "medium" | "high";

export interface PasswordPolicyOptions {
  minLength: number;
  complexity: PasswordComplexity;
}

export interface PasswordValidationResult {
  valid: boolean;
  message: string;
}

/**
 * 校验密码是否符合策略
 */
export function validatePassword(
  password: string,
  options: PasswordPolicyOptions,
): PasswordValidationResult {
  const { minLength, complexity } = options;

  if (!password || password.length < minLength) {
    return { valid: false, message: `密码长度不能少于 ${minLength} 位` };
  }

  switch (complexity) {
    case "medium": {
      const hasLetter = /[a-zA-Z]/.test(password);
      const hasDigit = /\d/.test(password);
      if (!hasLetter || !hasDigit) {
        return { valid: false, message: "密码需包含字母和数字" };
      }
      break;
    }
    case "high": {
      const hasLetter = /[a-zA-Z]/.test(password);
      const hasDigit = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
      if (!hasLetter || !hasDigit || !hasSpecial) {
        return { valid: false, message: "密码需包含字母、数字和特殊字符" };
      }
      break;
    }
    // 'low': 仅检查长度
  }

  return { valid: true, message: "" };
}
