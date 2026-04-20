// @aeron/core - 错误体系
// Error 是唯一允许使用 class 的场景

export class AeronError extends Error {
  readonly code: number;
  readonly errorCode: string;

  constructor(message: string, code: number, errorCode: string) {
    super(message);
    this.name = "AeronError";
    this.code = code;
    this.errorCode = errorCode;
  }
}

export class ClientError extends AeronError {
  constructor(
    message: string = "Client Error",
    code: number = 400,
    errorCode: string = "CLIENT_ERROR",
  ) {
    super(message, code, errorCode);
    this.name = "ClientError";
  }
}

export class ServerError extends AeronError {
  constructor(
    message: string = "Internal Server Error",
    code: number = 500,
    errorCode: string = "SERVER_ERROR",
  ) {
    super(message, code, errorCode);
    this.name = "ServerError";
  }
}

export class NotFoundError extends ClientError {
  constructor(message: string = "Not Found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends ClientError {
  constructor(message: string = "Validation Failed") {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ClientError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ClientError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}
