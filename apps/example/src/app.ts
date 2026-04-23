import { createApp, rateLimit, createMemoryRateLimitStore } from "@ventostack/core";
import { createEventBus } from "@ventostack/events";
import { createHealthCheck, createLogger, createMetrics } from "@ventostack/observability";
import type { Database } from "@ventostack/database";
import { config as defaultConfig, type AppConfig } from "./config";
import { createUserService } from "./services/user-service";
import { createAuthService } from "./services/auth-service";
import { requestLogger, errorHandler } from "./middleware/common";
import { registerRoutes } from "./routes";
import { setupExampleOpenAPI } from "./openapi";
import { userLoggedIn } from "./events/user-events";

export interface CreateAppOptions {
  db: Database;
  config?: Partial<AppConfig>;
}

export async function createExampleApp(options: CreateAppOptions) {
  const config = {
    port: options.config?.port ?? defaultConfig.port,
    jwtSecret: options.config?.jwtSecret ?? defaultConfig.jwtSecret,
    jwtExpiresIn: options.config?.jwtExpiresIn ?? defaultConfig.jwtExpiresIn,
    env: options.config?.env ?? defaultConfig.env,
  };

  const logger = createLogger({ level: config.env === "production" ? "warn" : "info", enabled: true });
  const bus = createEventBus();
  const health = createHealthCheck();
  const metrics = createMetrics();

  health.addCheck("database", async () => {
    try {
      await options.db.raw("SELECT 1");
      return true;
    } catch {
      return "Database connection failed";
    }
  });

  const userService = createUserService({ db: options.db });
  const authService = createAuthService({
    userService,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });

  bus.on(userLoggedIn, async (payload) => {
    logger.info("user logged in", { userId: payload.userId, email: payload.email, at: payload.at });
  });

  const app = createApp({ port: config.port });

  app.use(async (ctx, next) => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-XSS-Protection", "1; mode=block");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });

  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 100,
      message: "Too many requests",
      store: createMemoryRateLimitStore(),
    }),
  );

  app.use(errorHandler(logger));
  app.use(requestLogger(logger));

  app.router.get("/", async (ctx) =>
    ctx.json({ name: "VentoStack Example", version: "1.0.0", env: config.env }),
  );

  registerRoutes({ router: app.router, health, userService, authService, jwtSecret: config.jwtSecret });

  setupExampleOpenAPI(app);

  app.router.get("/metrics", async (_ctx) => {
    return new Response(metrics.render(), {
      headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  });

  return { app, db: options.db, userService, authService, health, metrics, bus, logger };
}
