# Aeron Framework

Aeron is a Bun-native fullstack backend framework built for performance and developer experience. It follows functional-first design principles with no classes, no decorators, and explicit dependencies.

## Overview

Aeron provides a complete suite of backend capabilities as composable packages:

| Package | Description |
|---|---|
| `@aeron/core` | HTTP server, routing, middleware, config, lifecycle, error handling |
| `@aeron/database` | Query builder, migrations, connection pooling, transactions |
| `@aeron/cache` | Cache layer with memory and Redis adapters |
| `@aeron/auth` | JWT, RBAC, OAuth, session management, MFA |
| `@aeron/events` | Event bus, pub/sub, event sourcing, CQRS |
| `@aeron/observability` | Metrics, tracing, structured logging, health checks |
| `@aeron/openapi` | OpenAPI 3.1 schema generation and validation |
| `@aeron/testing` | Test utilities, mocks, and test application helpers |
| `@aeron/ai` | AI integration with LLM adapters, RAG, and streaming |
| `@aeron/cli` | CLI tooling for scaffolding and code generation |

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
bun add @aeron/core
```

### Basic Application

```typescript
import { createApp, createRouter } from "@aeron/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello, Aeron!" });
});

const app = createApp({ port: 3000 });
app.use(router.middleware());
app.start();
```

### With Authentication

```typescript
import { createApp, createRouter } from "@aeron/core";
import { createJWT, createRBAC } from "@aeron/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const rbac = createRBAC();

rbac.addRole("admin", ["read", "write", "delete"]);
rbac.addRole("user", ["read"]);

const router = createRouter();

router.get("/protected", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  const payload = await jwt.verify(token!);
  return ctx.json({ user: payload });
});
```

### With Database

```typescript
import { createQueryBuilder, createMigrator } from "@aeron/database";

const db = createQueryBuilder({ url: process.env.DATABASE_URL! });

const users = await db
  .from("users")
  .select(["id", "name", "email"])
  .where("active", "=", true)
  .limit(10)
  .execute();
```

### With Cache

```typescript
import { createCache, createMemoryAdapter } from "@aeron/cache";

const cache = createCache({
  adapter: createMemoryAdapter(),
  ttl: 300,
});

await cache.set("key", { data: "value" });
const result = await cache.get("key");
```

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

Aeron uses environment variables following the 12-Factor App methodology. See each package's documentation for available configuration options.

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## License

MIT
