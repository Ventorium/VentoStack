// Aeron Example App — 展示框架核心功能
import { createApp, createRouter, NotFoundError, UnauthorizedError } from "@aeron/core";
import { createLogger, createHealthCheck } from "@aeron/observability";
import { createCache, createMemoryAdapter } from "@aeron/cache";
import { createEventBus, defineEvent } from "@aeron/events";
import { createJWT, createRBAC } from "@aeron/auth";
import { requestLogger, errorHandler } from "./middleware";

// ── 基础设施 ────────────────────────────────────────

const logger = createLogger({ level: "info", enabled: true });

const cache = createCache(createMemoryAdapter());

const bus = createEventBus();

const health = createHealthCheck();
health.addCheck("cache", async () => true);

const jwt = createJWT();
// 示例专用密钥，生产环境必须使用安全的密钥管理方案
const JWT_SECRET = "aeron-example-secret-key-at-least-32-bytes!";

const rbac = createRBAC();
rbac.addRole({
  name: "admin",
  permissions: [
    { resource: "users", action: "read" },
    { resource: "users", action: "write" },
  ],
});
rbac.addRole({
  name: "viewer",
  permissions: [{ resource: "users", action: "read" }],
});

// ── 事件 ────────────────────────────────────────────

const userLoggedIn = defineEvent<{ userId: string; at: string }>("user.logged_in");

bus.on(userLoggedIn, async (payload) => {
  logger.info("user logged in", { userId: payload.userId, at: payload.at });
});

// ── Mock 数据 ───────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const MOCK_USERS: User[] = [
  { id: "1", name: "Alice", email: "alice@example.com", role: "admin" },
  { id: "2", name: "Bob", email: "bob@example.com", role: "viewer" },
  { id: "3", name: "Charlie", email: "charlie@example.com", role: "viewer" },
];

// ── 路由 ────────────────────────────────────────────

const router = createRouter();

// 欢迎页
router.get("/", async (ctx) =>
  ctx.json({ name: "Aeron Example", version: "0.1.0" }),
);

// 健康检查
router.get("/health/live", async (ctx) => ctx.json(health.live()));

router.get("/health/ready", async (ctx) => {
  const status = await health.ready();
  return ctx.json(status, status.status === "ok" ? 200 : 503);
});

// API 路由组
router.group("/api", (api) => {
  // 用户列表
  api.get("/users", async (ctx) => {
    // 尝试从缓存读取
    const cached = await cache.get<User[]>("users:list");
    if (cached) {
      return ctx.json({ users: cached, source: "cache" });
    }

    // 缓存未命中，使用 mock 数据
    await cache.set("users:list", MOCK_USERS, { ttl: 60 });
    return ctx.json({ users: MOCK_USERS, source: "store" });
  });

  // 用户详情
  api.get("/users/:id", async (ctx) => {
    const user = MOCK_USERS.find((u) => u.id === ctx.params.id);
    if (!user) {
      throw new NotFoundError(`User ${ctx.params.id} not found`);
    }
    return ctx.json({ user });
  });

  // 登录（返回 JWT）
  api.post("/auth/login", async (ctx) => {
    const body = (await ctx.request.json()) as {
      email?: string;
      password?: string;
    };

    if (!body.email || !body.password) {
      return ctx.json({ error: "email and password required" }, 400);
    }

    const user = MOCK_USERS.find((u) => u.email === body.email);
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    // 示例中不验证密码，仅演示 JWT 签发
    const token = await jwt.sign(
      { sub: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: 3600 },
    );

    // 发布登录事件
    await bus.emit(userLoggedIn, {
      userId: user.id,
      at: new Date().toISOString(),
    });

    return ctx.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  });
});

// ── 启动应用 ─────────────────────────────────────────

const app = createApp({ port: 3000 });

// 注册全局中间件
app.use(errorHandler(logger));
app.use(requestLogger(logger));

// 挂载路由
for (const route of router.routes()) {
  const method = route.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  app.router[method](route.path, route.handler, ...route.middleware);
}

logger.info("starting Aeron example app", { port: 3000 });
app.listen();
