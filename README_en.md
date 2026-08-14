<p align="center">
  <img src="./assets/logo.webp" alt="VentoStack" width="240">
</p>

<h1 align="center">VentoStack Framework</h1>

<p align="center">
  <a href="./README.md">简体中文</a>
</p>

<p align="center">
  A high-performance fullstack backend framework built for the Bun runtime
</p>

VentoStack is a Bun-native fullstack backend framework built for performance and developer experience. It follows functional-first design principles with no classes, no decorators, and explicit dependencies.

## Overview

VentoStack publishes its full capability set as `@ventostack/*` packages on npm — **23 packages** in total, split into two layers: the **framework layer** (12 packages, business-agnostic building blocks) and the **platform layer** (11 packages, ready-made business modules assembled by `@ventostack/boot`).

### Framework Layer (12)

| Package | Capabilities | Depends on |
|---|---|---|
| `@ventostack/core` | HTTP routing, Context, middleware, error handling, lifecycle, config management, schema validation, security middleware (CORS/CSRF/SSRF/XSS/HMAC/upload/IP filter/rate limit), WebSocket/RPC/gRPC | none |
| `@ventostack/database` | Typed query builder, migrations, seeds, transactions, connection pooling, read/write split, relations, schema diff, tenant isolation | core |
| `@ventostack/cache` | Unified cache interface, Redis/memory adapters, L1/L2 multi-level cache, distributed locks, TTL jitter | core |
| `@ventostack/events` | Event bus, message queue, delayed queue, Saga/TCC, local & distributed scheduling | core |
| `@ventostack/observability` | Structured logging (auto-masked), Prometheus metrics, OpenTelemetry tracing, health checks, audited logs (hash chain) | core |
| `@ventostack/openapi` | OpenAPI 3.1 generation, request validation, Swagger UI / Scalar UI, API diff analysis | core |
| `@ventostack/testing` | Test app/client, fixtures, data factories, transaction isolation, security baseline regression suite | core |
| `@ventostack/webhook` | Inbound/outbound webhooks, HMAC/RSA-SHA256 signature verification, replay protection, exponential backoff | core |
| `@ventostack/cli` | Functional CLI, project scaffolding (`create`), code generation, migration commands, secure password generation | core, database |
| `@ventostack/file2md` | Office docs to Markdown (docx/pdf/xlsx/pptx/epub), MIME detection, safe ZIP reads, OCR interface | none (3rd-party: liteparse) |
| `@ventostack/ai` | LLM gateway (multi-provider), Agent Loop, Tool Registry, MCP Server, Session/Memory, Skill, RAG, sandboxed execution, token budgets | core, database, cache, events, observability, file2md |
| `@ventostack/vite-bridge` | Bridge between the backend and the Vite dev server for fullstack local development | core |

### Platform Layer (11)

| Package | Capabilities | Depends on |
|---|---|---|
| `@ventostack/auth` | JWT (algorithm whitelist), Session (memory/Redis), API Keys, RBAC/ABAC, policy engine, row-level filtering, TOTP, OAuth | core, database, cache |
| `@ventostack/system` | Users, roles, menus, departments, positions, dictionaries, configs, notices, operation logs, login/MFA/Passkey | core, database, cache, auth, events, observability |
| `@ventostack/boot` | `createPlatform()` composition root that wires infrastructure and toggles platform modules | all platform packages |
| `@ventostack/gen` | Database table import, Model/Service/Routes/Types/test code generation | core, database, auth |
| `@ventostack/i18n` | Locale/Message management, runtime translation, default & fallback language policy | core, database, auth |
| `@ventostack/monitor` | Server/Redis/datasource/health/online-user monitoring | core, database, auth, observability |
| `@ventostack/notification` | Notification templates, in-app/SMTP/SMS/Webhook channels, read status | core, database, auth, observability |
| `@ventostack/oss` | Object storage (local/S3 adapters), upload/download/delete, signed URLs, path traversal protection | core, database, auth |
| `@ventostack/scheduler` | Persistent cron jobs, execution logs, manual triggers | core, database, auth, events |
| `@ventostack/workflow` | Flow definitions & graph validation, serial/countersign/or-sign/ratio approval, reject/transfer/counter-sign/withdraw | core, database, auth, events |
| `@ventostack/integration` | Third-party callback verification (Stripe/GitHub/DingTalk/Slack/Shopify/WeChat Pay/Alipay) | webhook |

### Choosing Packages by Use Case

| Use case | Recommended packages |
|---|---|
| Plain HTTP API | `@ventostack/core` |
| API + database (CRUD) | `core` + `database` |
| Caching / rate limiting / distributed locks | `core` + `cache` |
| Authentication & authorization | `auth` + `database` + `cache` |
| Admin panel (users/roles/menus) | `boot` + `system` + `auth` |
| Event-driven / async tasks | `events` |
| Cron jobs | `scheduler` + `events` |
| Monitoring / audit | `observability` |
| API contract docs | `openapi` |
| Third-party callbacks (payments) | `webhook` + `integration` |
| AI agents / RAG / MCP | `ai` + `file2md` + `database` + `cache` |
| File uploads / object storage | `oss` |
| In-app / email / SMS notifications | `notification` |
| Approval workflows | `workflow` |
| Code generation (table → CRUD) | `gen` |
| Internationalization | `i18n` |
| Server/cache monitoring dashboard | `monitor` |
| Local fullstack dev experience | `vite-bridge` |
| Project scaffolding | `cli` |
| Test tooling | `testing` |

> Dependencies follow a one-way layering rule: the framework layer never depends on the platform layer; the platform layer only depends on the framework layer.

## Design Principles

- **Bun-native**: Built specifically for Bun runtime, not Node.js compatibility layer
- **Functional-first**: Factory functions (`createXxx()`), no classes or decorators
- **Explicit dependencies**: No global singletons, everything is injected
- **TypeScript strict**: Full type safety throughout

## Quick Start

### Requirements

- [Bun](https://bun.sh) >= 1.0.0

### Installation

```bash
bun add @ventostack/core
```

### Basic Application

```typescript
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello, VentoStack!" });
});

const app = createApp({ port: 3000 });
app.use(router);
await app.listen();
```

### With Authentication

```typescript
import { createApp, createRouter } from "@ventostack/core";
import { createJWT, createRBAC } from "@ventostack/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const rbac = createRBAC();

rbac.addRole({
  name: "admin",
  permissions: [
    { resource: "users", action: "read" },
    { resource: "users", action: "write" },
    { resource: "users", action: "delete" },
  ],
});
rbac.addRole({
  name: "user",
  permissions: [{ resource: "users", action: "read" }],
});

const router = createRouter();

router.get("/protected", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  const payload = await jwt.verify(token!);
  return ctx.json({ user: payload });
});
```

### With Database

```typescript
import { createDatabase, defineModel, column } from "@ventostack/database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  email: column.varchar({ length: 255 }),
  name: column.varchar({ length: 255 }),
});

const db = createDatabase({
  url: process.env.DATABASE_URL!,
  executor: async () => [],
});

const users = await db
  .query(UserModel)
  .select("id", "name", "email")
  .where("active", "=", true)
  .limit(10)
  .list();
```

### With Cache

```typescript
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter());

await cache.set("key", { data: "value" }, { ttl: 300 });
const result = await cache.get("key");
```

## Route Schemas and Response Declarations

```typescript
import { createRouter, defineRouteConfig } from "@ventostack/core";

const router = createRouter();

router.get("/things", defineRouteConfig({
  query: {
    page: { type: "int", default: 1 },
  },
  responses: {
    200: {
      page: { type: "int" },
    },
  },
}), (ctx) => {
  return ctx.json({ page: ctx.query.page });
});

router.get("/health", defineRouteConfig({
  responses: {
    200: {
      contentType: "text/plain",
      schema: { type: "string" },
      description: "Plain text health check",
    },
  },
}), (ctx) => ctx.text("ok"));

const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
    controller.close();
  },
});

router.get("/events", defineRouteConfig({
  responses: {
    200: {
      contentType: "text/event-stream",
      schema: { type: "string" },
      description: "Server-Sent Events stream",
    },
  },
}), (ctx) => ctx.stream(stream, "text/event-stream"));
```

- `responses: { 200: { id: { type: "int" } } }` is the shorthand for JSON responses.
- For non-JSON responses, use the wrapped form with `contentType + schema`, for example `text/plain`, `text/html`, or `text/event-stream`.
- Declared response schemas are runtime-validated for non-streaming `application/json` and `text/*` responses. Mismatches return `RESPONSE_VALIDATION_ERROR`.
- If VS Code gives weak completions for the second `router.get()` argument, prefer `defineRouteConfig(...)` for more stable contextual hints without losing inference.

## Release Flow

- Publishable packages under `packages/` are automatically published to npm through GitHub Actions
- Any PR that changes `packages/**` must include a `.changeset/*.md` file
- After merging to `main`, Changesets creates the version update and the workflow publishes the packages
- Publishing uses npm Trusted Publishing / OIDC, so no long-lived `NPM_TOKEN` is required
- You still need to register this repository's GitHub Actions workflow as a trusted publisher on npmjs.com

## Project Structure

```
fullstack/
  apps/
    example/          - Example application
    docs/             - Documentation site (Starlight)
  packages/
    core/             - Core HTTP framework
    database/         - Database layer
    cache/            - Cache layer
    auth/             - Authentication & authorization
    events/           - Event system
    observability/    - Metrics, tracing, logging
    openapi/          - OpenAPI schema generation
    testing/          - Test utilities
    ai/               - AI integration
    cli/              - CLI tools
  docs/               - Documentation sources
```

## Development

```bash
# Install dependencies
bun install

# Start example app with hot reload
bun dev

# Start docs dev server
bun run dev:doc

# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Type check
bun run typecheck
```

## Testing

All packages are tested with `bun:test`. The test suite covers unit tests for every module.

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test packages/core

# Run a specific test file
bun test packages/core/src/__tests__/router.test.ts
```

## Configuration

VentoStack uses environment variables following the 12-Factor App methodology. See each package's documentation for available configuration options.

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## License

MIT
