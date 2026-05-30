import type { Router } from "@ventostack/core";
import type { requireAuth } from "../middleware/auth";
import { validateLogin } from "../middleware/validation";
import type { createAuthService } from "../services/auth-service";

export interface AuthRoutesDeps {
  authService: ReturnType<typeof createAuthService>;
  requireAuthMiddleware: ReturnType<typeof requireAuth>;
}

export function registerAuthRoutes(router: Router, deps: AuthRoutesDeps): void {
  const { authService, requireAuthMiddleware } = deps;

  router.post(
    "/api/auth/login",
    async (ctx) => {
      const body = ctx.request.json ? await ctx.request.json() : {};
      const result = await authService.loginUser(body as { email: string; password: string });
      return ctx.json({
        token: result.token,
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
        },
      });
    },
    validateLogin,
  );

  router.get(
    "/api/auth/me",
    async (ctx) => {
      const user = ctx.user as { userId: string; email: string; role: string };
      return ctx.json({ user });
    },
    requireAuthMiddleware,
  );
}
