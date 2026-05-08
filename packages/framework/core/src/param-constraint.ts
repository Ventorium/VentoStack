// @ventostack/core - 路由参数类型注册表

/** 支持的参数类型 */
export type ParamType = "string" | "int" | "float" | "bool" | "uuid" | "date";

/** 参数类型到 TS 类型的映射 */
export interface ParamTypeMap {
  /** 字符串 */
  string: string;
  /** 整数 */
  int: number;
  /** 浮点数 */
  float: number;
  /** 布尔值 */
  bool: boolean;
  /** UUID */
  uuid: string;
  /** 日期 */
  date: Date;
}

/** 参数类型定义 */
export interface ParamTypeDef<T = unknown> {
  /** 校验正则 */
  pattern: RegExp;
  /** 类型转换函数 */
  coerce: (value: string) => T;
  /** 校验失败提示信息 */
  message?: string;
}

/** 内置参数类型注册表 */
export const paramTypes: {
  [K in ParamType]: ParamTypeDef<ParamTypeMap[K]>;
} = {
  string: {
    pattern: /^[^/]+$/,
    coerce: (v) => v,
  },
  int: {
    pattern: /^-?\d+$/,
    coerce: (v) => parseInt(v, 10),
    message: "必须为整数",
  },
  float: {
    pattern: /^-?\d+(\.\d+)?$/,
    coerce: (v) => parseFloat(v),
    message: "必须为数字",
  },
  bool: {
    pattern: /^(true|false|1|0)$/i,
    coerce: (v) => /^(true|1)$/i.test(v),
    message: "必须为布尔值",
  },
  uuid: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    coerce: (v) => v,
    message: "必须为有效的 UUID",
  },
  date: {
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/,
    coerce: (v) => new Date(v),
    message: "必须为有效的 ISO 8601 日期",
  },
};

/**
 * 判断给定字符串是否为有效的参数类型
 * @param type - 类型字符串
 * @returns 是否为有效参数类型
 */
export function isValidParamType(type: string): type is ParamType {
  return type in paramTypes;
}
