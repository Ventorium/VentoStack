import { type JWTPayload, createJWT } from "@ventostack/auth";
import { UnauthorizedError } from "@ventostack/core";
import type { User } from "../models";
import type { createUserService } from "./user-service";

export interface AuthServiceDeps {
  userService: ReturnType<typeof createUserService>;
  jwtSecret: string;
  jwtExpiresIn: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

const jwt = createJWT();

export function createAuthService(deps: AuthServiceDeps) {
  const { userService, jwtSecret, jwtExpiresIn } = deps;

  async function hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password, { algorithm: "bcrypt" });
  }

  async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash);
  }

  async function createToken(user: User): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  }

  async function verifyToken(token: string): Promise<JWTPayload> {
    return jwt.verify(token, jwtSecret);
  }

  async function loginUser(input: LoginInput): Promise<AuthResult> {
    const user = await userService.getUserByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = await createToken(user);
    return { token, user };
  }

  return {
    hashPassword,
    verifyPassword,
    createToken,
    verifyToken,
    loginUser,
  };
}
