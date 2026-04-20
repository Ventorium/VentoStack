import { describe, test, expect } from "bun:test";
import {
  AeronError,
  ClientError,
  ServerError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
} from "../errors";

describe("AeronError", () => {
  test("creates error with code, errorCode, message", () => {
    const err = new AeronError("something broke", 500, "BROKEN");
    expect(err.message).toBe("something broke");
    expect(err.code).toBe(500);
    expect(err.errorCode).toBe("BROKEN");
    expect(err.name).toBe("AeronError");
  });

  test("is instanceof Error", () => {
    const err = new AeronError("test", 500, "TEST");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AeronError);
  });

  test("has stack trace", () => {
    const err = new AeronError("test", 500, "TEST");
    expect(err.stack).toBeDefined();
  });
});

describe("ClientError", () => {
  test("defaults to 400 CLIENT_ERROR", () => {
    const err = new ClientError();
    expect(err.code).toBe(400);
    expect(err.errorCode).toBe("CLIENT_ERROR");
    expect(err.message).toBe("Client Error");
    expect(err.name).toBe("ClientError");
  });

  test("accepts custom message, code, errorCode", () => {
    const err = new ClientError("bad input", 422, "UNPROCESSABLE");
    expect(err.message).toBe("bad input");
    expect(err.code).toBe(422);
    expect(err.errorCode).toBe("UNPROCESSABLE");
  });

  test("is instanceof AeronError", () => {
    const err = new ClientError();
    expect(err).toBeInstanceOf(AeronError);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ServerError", () => {
  test("defaults to 500 SERVER_ERROR", () => {
    const err = new ServerError();
    expect(err.code).toBe(500);
    expect(err.errorCode).toBe("SERVER_ERROR");
    expect(err.message).toBe("Internal Server Error");
    expect(err.name).toBe("ServerError");
  });

  test("accepts custom message, code, errorCode", () => {
    const err = new ServerError("db down", 503, "SERVICE_UNAVAILABLE");
    expect(err.message).toBe("db down");
    expect(err.code).toBe(503);
    expect(err.errorCode).toBe("SERVICE_UNAVAILABLE");
  });

  test("is instanceof AeronError", () => {
    const err = new ServerError();
    expect(err).toBeInstanceOf(AeronError);
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("NotFoundError", () => {
  test("defaults to 404 NOT_FOUND", () => {
    const err = new NotFoundError();
    expect(err.code).toBe(404);
    expect(err.errorCode).toBe("NOT_FOUND");
    expect(err.message).toBe("Not Found");
    expect(err.name).toBe("NotFoundError");
  });

  test("accepts custom message", () => {
    const err = new NotFoundError("User not found");
    expect(err.message).toBe("User not found");
    expect(err.code).toBe(404);
  });

  test("is instanceof ClientError", () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toBeInstanceOf(AeronError);
  });
});

describe("ValidationError", () => {
  test("defaults to 400 VALIDATION_ERROR", () => {
    const err = new ValidationError();
    expect(err.code).toBe(400);
    expect(err.errorCode).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Validation Failed");
    expect(err.name).toBe("ValidationError");
  });

  test("accepts custom message", () => {
    const err = new ValidationError("email is invalid");
    expect(err.message).toBe("email is invalid");
  });

  test("is instanceof ClientError", () => {
    const err = new ValidationError();
    expect(err).toBeInstanceOf(ClientError);
  });
});

describe("UnauthorizedError", () => {
  test("defaults to 401 UNAUTHORIZED", () => {
    const err = new UnauthorizedError();
    expect(err.code).toBe(401);
    expect(err.errorCode).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
    expect(err.name).toBe("UnauthorizedError");
  });

  test("accepts custom message", () => {
    const err = new UnauthorizedError("token expired");
    expect(err.message).toBe("token expired");
  });

  test("is instanceof ClientError", () => {
    const err = new UnauthorizedError();
    expect(err).toBeInstanceOf(ClientError);
  });
});

describe("ForbiddenError", () => {
  test("defaults to 403 FORBIDDEN", () => {
    const err = new ForbiddenError();
    expect(err.code).toBe(403);
    expect(err.errorCode).toBe("FORBIDDEN");
    expect(err.message).toBe("Forbidden");
    expect(err.name).toBe("ForbiddenError");
  });

  test("accepts custom message", () => {
    const err = new ForbiddenError("admin only");
    expect(err.message).toBe("admin only");
  });

  test("is instanceof ClientError", () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(ClientError);
  });
});
