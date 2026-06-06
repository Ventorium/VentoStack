// @ventostack/core - 校验常量与工具函数
// 提供统一的正则表达式和校验规则，供 schema-types.ts 和其他模块复用
// 正则定义与前端 apps/admin/web/src/utils/validators.ts 中的 PATTERNS 保持一致

/** 校验用正则表达式 */
export const VALIDATION_PATTERNS = {
  /** 邮箱格式（RFC 5322 兼容） */
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  /** 中国大陆手机号 */
  phone: /^1[3-9]\d{9}$/,
} as const;

/**
 * 校验邮箱格式
 * @param value 待校验的字符串
 * @returns 是否通过校验
 */
export function isValidEmail(value: string): boolean {
  return VALIDATION_PATTERNS.email.test(value);
}

/**
 * 校验手机号格式（中国大陆）
 * @param value 待校验的字符串
 * @returns 是否通过校验
 */
export function isValidPhone(value: string): boolean {
  return VALIDATION_PATTERNS.phone.test(value);
}
