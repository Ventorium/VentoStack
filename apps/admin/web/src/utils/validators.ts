/**
 * 表单校验规则工具函数
 * 所有表单校验规则统一从此处导入，禁止在页面中内联定义
 */

// ─── 正则常量 ───
export const PATTERNS = {
  /** 中国大陆手机号 */
  phone: /^1[3-9]\d{9}$/,
  /** 邮箱 */
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  /** 用户名：字母、数字、下划线、中文 */
  username: /^[a-zA-Z0-9_一-龥]+$/,
  /** 密码：包含字母和数字 */
  passwordMedium: /^(?=.*[a-zA-Z])(?=.*\d)/,
  /** 密码：包含字母、数字和特殊字符 */
  passwordHigh: /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
};

// ─── Ant Design Form Rule 工厂函数 ───

/** 手机号校验规则（可选字段，有值时校验格式） */
export const phoneRules = [
  { pattern: PATTERNS.phone, message: "手机号格式不正确" },
];

/** 邮箱校验规则（可选字段，有值时校验格式） */
export const emailRules = [
  { pattern: PATTERNS.email, message: "邮箱格式不正确" },
];

/** 用户名校验规则 */
export const usernameRules = [
  { required: true, message: "请输入用户名" },
  { min: 3, message: "用户名至少 3 个字符" },
  { max: 50, message: "用户名最多 50 个字符" },
  { pattern: PATTERNS.username, message: "用户名只能包含字母、数字、下划线和中文" },
];

/**
 * 密码校验规则（根据后端策略动态生成）
 * @param minLength 最小长度
 * @param complexity 复杂度等级
 */
export function getPasswordRules(
  minLength: number,
  complexity: "low" | "medium" | "high",
) {
  const rules: Array<
    { required: boolean; message: string }
    | { min: number; message: string }
    | { pattern: RegExp; message: string }
  > = [
    { required: true, message: "请输入密码" },
    { min: minLength, message: `密码不能少于${minLength}位` },
  ];

  if (complexity === "medium") {
    rules.push({ pattern: PATTERNS.passwordMedium, message: "密码需包含字母和数字" });
  } else if (complexity === "high") {
    rules.push({
      pattern: PATTERNS.passwordHigh,
      message: "密码需包含字母、数字和特殊字符",
    });
  }

  return rules;
}
