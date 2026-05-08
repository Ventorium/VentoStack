// @ventostack/core - 错误体系
// Error 是唯一允许使用 class 的场景

/** VentoStack 框架基础错误类 */
export class VentoStackError extends Error {
  /** HTTP 状态码 */
  readonly code: number;
  /** 业务错误码 */
  readonly errorCode: string;

  /**
   * 构造 VentoStackError
   * @param message - 错误描述
   * @param code - HTTP 状态码
   * @param errorCode - 业务错误码
   */
  constructor(message: string, code: number, errorCode: string) {
    super(message);
    this.name = "VentoStackError";
    this.code = code;
    this.errorCode = errorCode;
  }
}

/** 客户端错误（4xx） */
export class ClientError extends VentoStackError {
  /**
   * 构造 ClientError
   * @param message - 错误描述，默认 "客户端错误"
   * @param code - HTTP 状态码，默认 400
   * @param errorCode - 业务错误码，默认 "CLIENT_ERROR"
   */
  constructor(message = "客户端错误", code = 400, errorCode = "CLIENT_ERROR") {
    super(message, code, errorCode);
    this.name = "ClientError";
  }
}

/** 服务端错误（5xx） */
export class ServerError extends VentoStackError {
  /**
   * 构造 ServerError
   * @param message - 错误描述，默认 "服务器内部错误"
   * @param code - HTTP 状态码，默认 500
   * @param errorCode - 业务错误码，默认 "SERVER_ERROR"
   */
  constructor(message = "服务器内部错误", code = 500, errorCode = "SERVER_ERROR") {
    super(message, code, errorCode);
    this.name = "ServerError";
  }
}

/** 资源未找到错误（404） */
export class NotFoundError extends ClientError {
  /**
   * 构造 NotFoundError
   * @param message - 错误描述，默认 "资源不存在"
   */
  constructor(message = "资源不存在") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** 参数校验错误（400） */
export class ValidationError extends ClientError {
  /** 校验错误详情，例如字段级错误信息 */
  readonly details: Record<string, unknown> | undefined;

  /**
   * 构造 ValidationError
   * @param message - 错误描述，默认 "校验失败"
   * @param details - 可选的校验详情，例如字段级错误信息
   */
  constructor(message = "校验失败", details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/** 未认证错误（401） */
export class UnauthorizedError extends ClientError {
  /**
   * 构造 UnauthorizedError
   * @param message - 错误描述，默认 "未授权"
   */
  constructor(message = "未授权") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/** 禁止访问错误（403） */
export class ForbiddenError extends ClientError {
  /**
   * 构造 ForbiddenError
   * @param message - 错误描述，默认 "禁止访问"
   */
  constructor(message = "禁止访问") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}
