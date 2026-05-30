import type { Router } from "@ventostack/core";
import { type requireAuth, requireRole } from "../middleware/auth";
import { validateCreateUser, validateUpdateUser } from "../middleware/validation";
import type { createUserService } from "../services/user-service";

export interface UserRoutesDeps {
  userService: ReturnType<typeof createUserService>;
  requireAuthMiddleware: ReturnType<typeof requireAuth>;
}

export function registerUserRoutes(router: Router, deps: UserRoutesDeps): void {
  const { userService, requireAuthMiddleware } = deps;

  router.get(
    "/api/users",
    async (ctx) => {
      const users = await userService.listUsers();
      return ctx.json({
        data: users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          created_at: u.created_at,
          updated_at: u.updated_at,
        })),
      });
    },
    requireAuthMiddleware,
    requireRole("admin", "editor"),
  );

  router.get(
    "/api/users/:id",
    async (ctx) => {
      const id = ctx.params["id"]!;
      const user = await userService.getUserById(id);
      return ctx.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
      });
    },
    requireAuthMiddleware,
    requireRole("admin", "editor"),
  );

  router.post(
    "/api/users",
    async (ctx) => {
      const body = (await ctx.request.json()) as {
        name: string;
        email: string;
        password: string;
        role?: string;
      };
      const user = await userService.createUser(body);
      return ctx.json(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
        201,
      );
    },
    requireAuthMiddleware,
    requireRole("admin"),
    validateCreateUser,
  );

  router.patch(
    "/api/users/:id",
    async (ctx) => {
      const id = ctx.params["id"]!;
      const body = (await ctx.request.json()) as {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
      };
      const user = await userService.updateUser(id, body);
      return ctx.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at,
      });
    },
    requireAuthMiddleware,
    requireRole("admin"),
    validateUpdateUser,
  );

  router.delete(
    "/api/users/:id",
    async (ctx) => {
      const id = ctx.params["id"]!;
      await userService.deleteUser(id);
      return ctx.json({ success: true }, 204);
    },
    requireAuthMiddleware,
    requireRole("admin"),
  );
}
