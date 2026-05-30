/**
 * @ventostack/system - 密码策略校验测试
 */

import { describe, expect, test } from "bun:test";
import { validatePassword } from "../services/password-policy";

describe("validatePassword", () => {
  test("low complexity: 仅检查长度", () => {
    expect(validatePassword("123456", { minLength: 6, complexity: "low" })).toEqual({
      valid: true,
      message: "",
    });
    expect(validatePassword("12345", { minLength: 6, complexity: "low" })).toEqual({
      valid: false,
      message: "密码长度不能少于 6 位",
    });
    expect(validatePassword("", { minLength: 6, complexity: "low" })).toEqual({
      valid: false,
      message: "密码长度不能少于 6 位",
    });
  });

  test("medium complexity: 字母 + 数字", () => {
    expect(validatePassword("abc123", { minLength: 6, complexity: "medium" })).toEqual({
      valid: true,
      message: "",
    });
    expect(validatePassword("abcdef", { minLength: 6, complexity: "medium" })).toEqual({
      valid: false,
      message: "密码需包含字母和数字",
    });
    expect(validatePassword("123456", { minLength: 6, complexity: "medium" })).toEqual({
      valid: false,
      message: "密码需包含字母和数字",
    });
    expect(validatePassword("a1b2c3", { minLength: 6, complexity: "medium" })).toEqual({
      valid: true,
      message: "",
    });
  });

  test("high complexity: 字母 + 数字 + 特殊字符", () => {
    expect(validatePassword("abc123!", { minLength: 6, complexity: "high" })).toEqual({
      valid: true,
      message: "",
    });
    expect(validatePassword("abc123", { minLength: 6, complexity: "high" })).toEqual({
      valid: false,
      message: "密码需包含字母、数字和特殊字符",
    });
    expect(validatePassword("abcdef!", { minLength: 6, complexity: "high" })).toEqual({
      valid: false,
      message: "密码需包含字母、数字和特殊字符",
    });
    expect(validatePassword("123456!", { minLength: 6, complexity: "high" })).toEqual({
      valid: false,
      message: "密码需包含字母、数字和特殊字符",
    });
    expect(validatePassword("P@ssw0rd", { minLength: 8, complexity: "high" })).toEqual({
      valid: true,
      message: "",
    });
  });

  test("长度不足时优先返回长度错误", () => {
    expect(validatePassword("ab1", { minLength: 6, complexity: "high" })).toEqual({
      valid: false,
      message: "密码长度不能少于 6 位",
    });
  });

  test("minLength = 1 的边界情况", () => {
    expect(validatePassword("a", { minLength: 1, complexity: "low" })).toEqual({
      valid: true,
      message: "",
    });
    expect(validatePassword("", { minLength: 1, complexity: "low" })).toEqual({
      valid: false,
      message: "密码长度不能少于 1 位",
    });
  });
});
