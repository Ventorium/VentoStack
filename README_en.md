# VentoStack Framework

VentoStack is a Bun-native fullstack backend framework built for performance and developer experience. It follows functional-first design principles with no classes, no decorators, and explicit dependencies.

## Overview

VentoStack provides a complete suite of backend capabilities as composable packages:

| Package | Description |
|---|---|
| `@ventostack/core` | HTTP server, routing, middleware, config, lifecycle, error handling |
| `@ventostack/database` | Query builder, migrations, connection pooling, transactions |
| `@ventostack/cache` | Cache layer with memory and Redis adapters |
| `@ventostack/auth` | JWT, RBAC, OAuth, session management, MFA |
| `@ventostack/events` | Event bus, pub/sub, event sourcing, CQRS |
| `@ventostack/observability` | Metrics, tracing, structured logging, health checks |
| `@ventostack/openapi` | OpenAPI 3.1 schema generation and validation |
| `@ventostack/testing` | Test utilities, mocks, and test application helpers |
| `@ventostack/ai` | AI integration with LLM adapters, RAG, and streaming |
| `@ventostack/cli` | CLI tooling for scaffolding and code generation |

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
