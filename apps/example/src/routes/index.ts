import type { Router } from "@ventostack/core";
import type { HealthCheck } from "@ventostack/observability";
import { requireAuth } from "../middleware/auth";
import type { createAuthService } from "../services/auth-service";
import type { createUserService } from "../services/user-service";
import { registerAuthRoutes } from "./auth";
import { registerHealthRoutes } from "./health";
import { registerUserRoutes } from "./users";

export interface RegisterRoutesDeps {
  router: Router;
  health: HealthCheck;
  userService: ReturnType<typeof createUserService>;
  authService: ReturnType<typeof createAuthService>;
  jwtSecret: string;
}

export function registerRoutes(deps: RegisterRoutesDeps): void {
  const { router, health, userService, authService, jwtSecret } = deps;

  const requireAuthMiddleware = requireAuth(jwtSecret);

  registerHealthRoutes(router, health);
  registerAuthRoutes(router, { authService, requireAuthMiddleware });
  registerUserRoutes(router, { userService, requireAuthMiddleware });
}
