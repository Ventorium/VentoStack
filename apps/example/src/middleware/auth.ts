import { type JWTPayload, createJWT } from "@ventostack/auth";
import type { Middleware } from "@ventostack/core";
import { ForbiddenError, UnauthorizedError } from "@ventostack/core";

const jwt = createJWT();

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
}

export function requireAuth(jwtSecret: string): Middleware {
  return async (ctx, next) => {
    const header = ctx.headers.get("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    const token = header.slice(7);
    let payload: JWTPayload;
    try {
      payload = await jwt.verify(token, jwtSecret);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    ctx.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    } as AuthContext;

    return next();
  };
}

export function requireRole(...allowedRoles: string[]): Middleware {
  return async (ctx, next) => {
    const user = ctx.user as AuthContext | undefined;
    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    return next();
  };
}
