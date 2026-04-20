---
name: bun-runtime
description: Bun Runtime & Toolkit 完整参考。涵盖 HTTP、SQL、Redis、S3、文件 I/O、密码、Shell、测试、构建、压缩、Socket 等全部内置 API，以及常用反模式替代方案速查。当涉及 Aeron 框架代码中的 Bun API 使用、性能优化或依赖选择时调用。
---

# Bun Runtime & Toolkit — Complete Skill Reference
> Covers Bun ≥ 1.2 (up to 1.3.x). Always prefer Bun-native APIs over Node.js equivalents.
> When in doubt: if Bun has a built-in for it, **use it**.

---

## 0. 核心原则

- TypeScript / JSX / TSX 开箱即用，**无需 ts-node / babel / tsc**
- `import` 优先；仅在必须兼容 CJS 生态时用 `require`
- 能用 Bun 内置就不装 npm 包（数据库、S3、Redis、Hash、密码、Shell…）
- 标签模板字面量 `` sql`...` `` 是 Bun.SQL 的唯一正确调用方式，**不要** `.query()` 风格

---

## 1. HTTP 服务器 — `Bun.serve()`

```ts
import { serve } from "bun";

const server = serve({
  port: 3000,
  // ✅ 1.2.3+ 内置路由，无需框架
  routes: {
    "/":                      new Response("Hello"),
    "/api/users/:id":         req => Response.json({ id: req.params.id }),
    "/api/posts": {
      GET:  () => Response.json([]),
      POST: async req => Response.json(await req.json(), { status: 201 }),
    },
    "/api/*":                 Response.json({ error: "Not Found" }, { status: 404 }),
    "/favicon.ico":           Bun.file("./public/favicon.ico"),
  },
  fetch(req) {                // 兜底 fallback
    return new Response("Not Found", { status: 404 });
  },
});
console.log(`http://localhost:${server.port}`);
```

**WebSocket：**
```ts
serve({
  fetch(req, server) {
    if (server.upgrade(req, { data: { userId: "123" } })) return;
    return new Response("Upgrade required", { status: 426 });
  },
  websocket: {
    open(ws)          { ws.send("connected"); },
    message(ws, msg)  { ws.send(`echo: ${msg}`); },
    close(ws)         { console.log("closed"); },
    drain(ws)         {},
  },
});
```

**服务器控制：**
```ts
server.stop();           // 停止
server.reload(newOpts);  // 热更新路由，不中断连接
server.requestIP(req);   // 获取客户端 IP
server.timeout(req, 30); // 设置请求超时
```

---

## 2. 文件 I/O — `Bun.file()` / `Bun.write()`

```ts
// 读取
const f    = Bun.file("./data.json");
const json = await f.json();
const text = await f.text();
const buf  = await f.arrayBuffer();
const stat = await f.stat(); // { size, mtime, isFile(), isDirectory() }

// 写入（自动创建目录）
await Bun.write("./out.txt", "hello");
await Bun.write("./out.json", JSON.stringify(data));
await Bun.write(Bun.file("./copy.png"), Bun.file("./src.png")); // 零拷贝复制

// 流
const stream = Bun.file("./big.csv").stream();
for await (const chunk of stream) { /* process chunk */ }

// 检查存在
const exists = await Bun.file("./x.txt").exists();
```

---

## 3. SQL 数据库 — `Bun.sql` / `new SQL()`

> 统一 API，支持 **PostgreSQL / MySQL / MariaDB / SQLite**（Bun 1.2.21+）

```ts
import { sql } from "bun"; // 默认从 DATABASE_URL 环境变量连接

// 查询 — 始终用标签模板字面量
const users = await sql`SELECT * FROM users WHERE id = ${userId}`;

// 事务
const result = await sql.transaction(async tx => {
  await tx`INSERT INTO orders (user_id) VALUES (${uid})`;
  await tx`UPDATE inventory SET qty = qty - 1 WHERE id = ${itemId}`;
  return await tx`SELECT * FROM orders WHERE user_id = ${uid}`;
});

// 批量插入
const rows = [{ name: "Alice" }, { name: "Bob" }];
await sql`INSERT INTO users ${sql(rows, "name")}`;

// 自定义连接
import { SQL } from "bun";
const pg    = new SQL("postgres://user:pass@localhost/mydb");
const mysql = new SQL({ adapter: "mysql", hostname: "127.0.0.1", username: "root", password: "pass", database: "mydb" });
const lite  = new SQL("sqlite://./local.db");       // 或 ":memory:"
await pg`SELECT 1`;
await pg.close();

// sql.array / sql fragments
const ids = [1, 2, 3];
await sql`SELECT * FROM users WHERE id = ANY(${sql.array(ids)})`;
const filter = sql`WHERE active = true`;
await sql`SELECT * FROM users ${filter}`;

// sql.file — 从文件加载 SQL
await sql.file("./migrations/001.sql");
```

---

## 4. SQLite（内置，无需 pg/better-sqlite3）— `bun:sqlite`

```ts
import { Database } from "bun:sqlite";

const db = new Database("./app.db"); // 或 ":memory:"
db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, val TEXT)`);

// 预编译语句（自动缓存）
const get = db.query<{ val: string }, [string]>("SELECT val FROM kv WHERE key = ?");
const set = db.query("INSERT OR REPLACE INTO kv VALUES (?, ?)");

set.run("foo", "bar");
console.log(get.get("foo")); // { val: "bar" }
get.all();     // 返回数组
get.values();  // 返回二维数组（更快）

// 事务
const insertMany = db.transaction((rows: string[][]) => {
  for (const [k, v] of rows) set.run(k, v);
});
insertMany([["a","1"],["b","2"]]);
db.close();
```

---

## 5. S3 对象存储 — `Bun.s3` / `s3()`

> 从环境变量自动读取凭证：`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`

```ts
import { s3, S3Client } from "bun";

// 读
const text = await s3("s3://my-bucket/hello.txt").text();
const blob = await s3("s3://my-bucket/img.png").blob();

// 写
await s3("s3://my-bucket/data.json").write(JSON.stringify({ ok: true }));

// 流式上传
const file = Bun.file("./big.tar.gz");
await s3("s3://my-bucket/big.tar.gz").write(file);

// 删除
await s3("s3://my-bucket/old.txt").unlink();

// 元数据
const stat = await s3("s3://my-bucket/file.txt").stat();

// 预签名 URL
const url = s3("s3://my-bucket/secret.pdf").presign({ expiresIn: 3600 });

// 自定义客户端（R2、MinIO…）
const r2 = new S3Client({
  endpoint: "https://<account>.r2.cloudflarestorage.com",
  accessKeyId: process.env.R2_KEY,
  secretAccessKey: process.env.R2_SECRET,
  bucket: "my-bucket",
});
await r2.file("hello.txt").write("world");

// 用作 fetch body / Response body（Web 标准兼容）
const res = new Response(s3("s3://bucket/file.csv"));
```

---

## 6. Redis — `Bun.redis`

> 从 `REDIS_URL` 或 `VALKEY_URL` 自动连接，默认 `valkey://localhost:6379`

```ts
import { redis, RedisClient } from "bun";

// 基本操作
await redis.set("key", "value");
await redis.set("key", "value", { ex: 60 });  // TTL 秒
const val = await redis.get("key");            // string | null
await redis.del("key");
await redis.incr("counter");
await redis.expire("key", 30);

// Hash
await redis.hset("user:1", { name: "Alice", age: "30" });
const name = await redis.hget("user:1", "name");
const all  = await redis.hgetall("user:1");

// List
await redis.lpush("queue", "item1", "item2");
const item = await redis.rpop("queue");

// Set / ZSet
await redis.sadd("tags", "ts", "bun");
await redis.zadd("scores", { Alice: 100, Bob: 200 });

// 管道（批量减少 RTT）
const pipe = redis.pipeline();
pipe.set("a", "1");
pipe.set("b", "2");
pipe.get("a");
const results = await pipe.exec(); // [OK, OK, "1"]

// Pub/Sub
const sub = new RedisClient();
await sub.subscribe("channel", (msg) => console.log(msg));
await redis.publish("channel", "hello");

// 自定义连接
const client = new RedisClient("redis://:password@host:6379/0");
```

---

## 7. Shell — `$` (Bun Shell)

> 跨平台，Windows 也能用，支持管道和 JS 插值

```ts
import { $ } from "bun";

// 基本执行
await $`echo "Hello"`;
const out = await $`ls -la`.text();
const lines = await $`cat package.json`.lines(); // string[]

// 插值（自动转义）
const dir = "/tmp/my dir";
await $`mkdir -p ${dir}`;

// 管道
const count = await $`cat data.txt | wc -l`.text();

// 从 fetch 响应管道
const res = await fetch("https://example.com/data.tar.gz");
await $`tar -xz < ${res}`;

// 环境变量
await $`echo $NAME`.env({ NAME: "Bun" });

// 工作目录
await $`ls`.cwd("/tmp");

// 静默错误
const result = await $`exit 1`.nothrow();
console.log(result.exitCode); // 1

// 同步执行
const syncOut = $.sync`echo sync`.text();
```

---

## 8. 测试 — `bun:test`

```ts
import { describe, test, it, expect, beforeAll, afterEach, mock, spyOn } from "bun:test";

describe("User", () => {
  test("create", () => {
    expect({ id: 1 }).toMatchObject({ id: expect.any(Number) });
  });

  test("async", async () => {
    await expect(Promise.resolve(42)).resolves.toBe(42);
  });

  // 内联 snapshot
  test("snapshot", () => {
    expect({ a: 1 }).toMatchInlineSnapshot();
  });

  // Mock
  test("mock fn", () => {
    const fn = mock(() => 42);
    fn();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // spyOn
  test("spy", () => {
    const obj = { greet: () => "hi" };
    const spy = spyOn(obj, "greet").mockReturnValue("mocked");
    expect(obj.greet()).toBe("mocked");
    spy.mockRestore();
  });
});

// Fake timers
import { setSystemTime } from "bun:test";
setSystemTime(new Date("2025-01-01"));

// test.only — 无需 --only flag（Bun 1.2+）
test.only("focused", () => expect(1).toBe(1));
test.skip("skip me", () => {});
test.todo("implement later");
```

**CLI：**
```bash
bun test                        # 运行所有测试
bun test --watch                # 监听模式
bun test --coverage             # 覆盖率报告
bun test --grep "User"          # 过滤测试名
bun test --bail                 # 首次失败即停止
bun test --timeout 5000         # 超时 ms
```

---

## 9. 进程 / 子进程 — `Bun.spawn()`

```ts
import { spawn, spawnSync } from "bun";

// 异步
const proc = spawn(["git", "log", "--oneline"], {
  cwd: "./repo",
  env: { ...process.env, GIT_PAGER: "" },
  stdout: "pipe",
  stderr: "pipe",
});
const text = await new Response(proc.stdout).text();
await proc.exited;

// 同步
const result = spawnSync(["node", "--version"]);
console.log(result.stdout.toString());

// 发送信号
proc.kill("SIGTERM");
```

---

## 10. 密码 & 安全 — `Bun.password` / `Bun.CSRF` / `Bun.hash`

```ts
import { password, CSRF } from "bun";

// 密码哈希（bcrypt / argon2，自动选择最优算法）
const hash    = await password.hash("secret");         // argon2id
const hash2   = await password.hash("secret", "bcrypt");
const ok      = await password.verify("secret", hash); // boolean

// CSRF Token
const csrf  = new CSRF();
const token = csrf.generate("session-secret");
csrf.verify(token, "session-secret");                  // throws 若无效

// 快速哈希（非加密）
Bun.hash("hello");                // Wyhash（默认）
Bun.hash.crc32("hello");
Bun.hash.xxh3("hello");
Bun.hash.adler32("hello");

// 加密哈希
const h = new Bun.CryptoHasher("sha256");
h.update("part1");
h.update("part2");
const digest = h.digest("hex");
```

---

## 11. WebSocket 客户端

```ts
const ws = new WebSocket("wss://echo.example.com");
ws.onopen    = () => ws.send("hello");
ws.onmessage = e  => console.log(e.data);
ws.onclose   = () => console.log("closed");

// 通过代理
const proxied = new WebSocket("wss://example.com", {
  headers: { Authorization: "Bearer token" },
});
```

---

## 12. 工作线程 — `Worker`

```ts
// main.ts
const worker = new Worker(new URL("./worker.ts", import.meta.url));
worker.postMessage({ task: "compute" });
worker.onmessage = e => console.log(e.data);

// worker.ts
self.onmessage = e => {
  const result = heavyCompute(e.data.task);
  self.postMessage(result);
};
```

---

## 13. Glob — `Bun.Glob`

```ts
import { Glob } from "bun";

const glob = new Glob("**/*.ts");

// 同步扫描
for (const file of glob.scanSync(".")) console.log(file);

// 异步扫描
for await (const file of glob.scan({ cwd: "./src", dot: false })) {
  console.log(file);
}

// 匹配测试
glob.match("src/index.ts"); // boolean
```

---

## 14. 环境变量 — 自动加载 `.env`

```ts
// 无需 dotenv，Bun 自动加载 .env / .env.local / .env.production 等
const secret = process.env.API_KEY;     // 或
const secret2 = Bun.env.API_KEY;        // 等价

// 类型安全（推荐在 env.ts 集中校验）
if (!Bun.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
```

---

## 15. 打包 — `bun build`

```ts
// 代码方式
const out = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",          // "bun" | "browser" | "node"
  format: "esm",          // "esm" | "cjs" | "iife"
  minify: true,
  splitting: true,
  sourcemap: "external",
  external: ["react"],    // 不打包的依赖
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [myPlugin],
});
```

**CLI：**
```bash
bun build ./src/index.ts --outdir dist --minify --target bun
bun build ./src/index.ts --compile          # 编译为单文件可执行文件
bun build ./src/index.ts --compile --target linux-x64  # 交叉编译
bun build ./index.html   --outdir dist      # HTML 入口，自动打包 JS/CSS
```

---

## 16. HTML Imports（Bun 1.2+）

```ts
// 直接 import HTML 文件，自动打包 JS/CSS/React/Tailwind
import home from "./index.html";

Bun.serve({
  routes: {
    "/": home,
  },
});
```

```html
<!-- index.html -->
<script type="module" src="./app.tsx"></script>
<link rel="stylesheet" href="./styles.css">
```

---

## 17. CSS / YAML / TOML / 静态资源 Import

```ts
// CSS（bun build 时自动处理）
import styles from "./styles.css" with { type: "css" };

// YAML（Bun 1.2.21+ 原生支持）
import config from "./config.yaml" with { type: "yaml" };

// TOML
import pkg from "./Cargo.toml" with { type: "toml" };

// 文本文件
import sql from "./query.sql" with { type: "text" };

// JSON（原生，无需特殊标注）
import data from "./data.json";
```

---

## 18. 颜色 — `Bun.color()`

```ts
// 解析并转换颜色格式
Bun.color("#ff0000", "css");       // "rgb(255,0,0)"
Bun.color("red", "ansi");          // ANSI 颜色码
Bun.color([255,0,0,255], "hex");   // "#ff0000ff"
Bun.color("hsl(0,100%,50%)", "rgb").r; // 255
```

---

## 19. Markdown — `Bun.markdown`

```ts
// 渲染为 HTML
const html = Bun.markdown.html("# Hello **world**");
// "<h1>Hello <strong>world</strong></h1>"

// 渲染为 ANSI（终端输出）
const ansi = Bun.markdown.render("# Title", {
  heading: (children, { level }) => `\x1b[1m${children}\x1b[0m\n`,
});

// 渲染为 React 元素
const element = Bun.markdown.react("# Hello", { h1: MyHeading });
```

---

## 20. 归档 — `Bun.Archive`（Bun 1.2.14+）

```ts
import { Archive } from "bun";

// 创建 tar.gz
const archive = new Archive();
archive.add("file.txt", await Bun.file("./file.txt").bytes());
const tarball = archive.finish("gzip"); // Uint8Array
await Bun.write("out.tar.gz", tarball);

// 解压
const files = Archive.extract(tarball);
for (const [name, data] of files) {
  await Bun.write(name, data);
}
```

---

## 21. JSON 扩展 — JSONC / JSON5 / JSONL

```ts
import { JSONC, JSON5, JSONL } from "bun";  // 或 import "bun"

// JSONC（带注释的 JSON，如 tsconfig.json）
const cfg = JSONC.parse(`{ /* comment */ "key": "value", }`);

// JSON5
const val = JSON5.parse(`{ key: 'value', // comment\n}`);
console.log(JSON5.stringify({ a: 1 }, null, 2));

// JSONL（JSON Lines，流式友好）
const rows = JSONL.parse('{"a":1}\n{"b":2}\n');

// 流式 JSONL
const parser = new JSONL.Parser();
parser.write('{"a":1}\n');
parser.write('{"b":2}\n');
for (const obj of parser.flush()) console.log(obj);
```

---

## 22. 语义化版本 — `Bun.semver`

```ts
import { semver } from "bun";

semver.satisfies("1.2.3", "^1.0.0");  // true
semver.order("1.0.0", "2.0.0");       // -1 | 0 | 1
```

---

## 23. FFI — `bun:ffi`（调用原生动态库）

```ts
import { dlopen, FFIType, suffix } from "bun:ffi";

const { symbols } = dlopen(`libsqlite3.${suffix}`, {
  sqlite3_libversion: {
    args: [],
    returns: FFIType.cstring,
  },
});
console.log(symbols.sqlite3_libversion());
```

---

## 24. TranspilerAPI — `Bun.Transpiler`

```ts
const t = new Bun.Transpiler({ loader: "tsx" });
const js = t.transformSync(`const x: number = 1; export default <div/>`);
const imports = t.scanImports(`import React from "react"; import { useState } from "react";`);
```

---

## 25. HTMLRewriter（流式 HTML 转换）

```ts
const rewriter = new HTMLRewriter()
  .on("a[href]", {
    element(el) {
      el.setAttribute("target", "_blank");
    },
  })
  .on("h1", {
    text(chunk) {
      console.log(chunk.text);
    },
  });

const res = await fetch("https://example.com");
const transformed = rewriter.transform(res);
const html = await transformed.text();
```

---

## 26. Cookie — `Bun.CookieMap` / `request.cookies`（Bun 1.2.5+）

```ts
// 服务端读取 cookie（零开销解析）
serve({
  routes: {
    "/": req => {
      const session = req.cookies.get("session");  // string | null
      return Response.json({ session });
    },
  },
});

// 手动构建
const map = new Bun.CookieMap("session=abc; theme=dark");
map.get("session"); // "abc"
map.set("user", "alice", { httpOnly: true, secure: true, maxAge: 3600 });
const header = map.toSetCookieHeaders(); // string[]
```

---

## 27. DNS — `Bun.dns`

```ts
import { dns } from "bun";

const addrs = await dns.lookup("example.com");            // IPv4/v6
const records = await dns.resolveTxt("example.com");
const mx = await dns.resolveMx("example.com");
```

---

## 28. 定时任务 — `Bun.cron`（Bun 1.x+）

```ts
import { cron } from "bun";

const job = cron("0 * * * *", () => {
  console.log("每小时整点执行");
});

// 停止
job.stop();
```

---

## 29. Cron 语法辅助 — `Bun.CronJob`

```ts
// 支持标准 5 字段 cron 表达式
// 秒级：6 字段（"*/5 * * * * *"）
const job = cron("*/30 * * * *", async () => {
  await sql`UPDATE stats SET last_run = NOW()`;
});
```

---

## 30. Terminal API — `Bun.Terminal`（Bun 1.2.12+）

```ts
import { Terminal } from "bun";

const term = new Terminal(process.stdout);
term.write("Hello ");
term.write("\x1b[1mbold\x1b[0m");
term.clearLine();
await term.flush();
```

---

## 31. 包管理器 — `bun install`

```bash
bun install                    # 安装依赖（比 npm install 快 25x）
bun add express                # 添加依赖
bun add -d @types/node         # 添加 devDependency
bun add -g typescript          # 全局安装
bun remove lodash              # 删除
bun update                     # 更新所有
bun patch react                # patch 一个包
bun pm ls                      # 列出已安装
bun pm cache rm                # 清除缓存
```

**workspaces + catalog（Bun 1.3+）：**
```json
// bunfig.toml — 锁定版本 catalog
[install.catalog]
react = "^18.3.0"
typescript = "^5.0.0"
```

---

## 32. `bunx` — 无安装运行包

```bash
bunx create-next-app my-app
bunx --package=typescript tsc --init   # 指定包名
```

---

## 33. 运行脚本

```bash
bun run ./script.ts            # 直接运行 TS
bun run dev                    # package.json scripts
bun --hot run ./server.ts      # 热重载（代码修改不重启进程）
bun --watch run ./script.ts    # 文件变化重新执行
bun --smol run ./app.ts        # 低内存模式
```

---

## 34. 单文件可执行文件

```bash
# 编译（含依赖全部打包进二进制）
bun build ./cli.ts --compile --outfile my-cli

# 交叉编译
bun build ./server.ts --compile --target linux-x64 --outfile server-linux
bun build ./server.ts --compile --target windows-x64 --outfile server.exe

# 内嵌资源文件
bun build ./app.ts --compile --asset-naming "[name].[ext]" --outfile app
```

---

## 35. 内置 REPL

```bash
bun repl          # 支持 TypeScript、顶层 await、tab 补全
```

---

## 36. 调试

```bash
bun --inspect ./server.ts            # 开启 Chrome DevTools 调试
bun --inspect-brk ./server.ts        # 启动即暂停
BUN_INSPECT_PRELOAD=./setup.ts bun run ./app.ts
```

---

## 37. 常用工具函数

```ts
// 实用函数
Bun.stringWidth("hello 🎉");       // 字符显示宽度（终端对齐用）
Bun.stripANSI("\x1b[1mhello\x1b[0m"); // 去除 ANSI 转义码
Bun.pathToFileURL("./index.ts");   // Path → file:// URL
Bun.fileURLToPath("file:///x.ts"); // file:// URL → path
Bun.escapeHTML("<div>");           // "&lt;div&gt;"
Bun.peek(promise);                 // 同步读取 Promise 状态（不 await）
Bun.sleep(100);                    // Promise-based setTimeout
Bun.sleepSync(100);                // 同步阻塞 sleep（ms）
Bun.nanoseconds();                 // 高精度时间戳（ns）
Bun.openInEditor("./src/index.ts"); // 在编辑器中打开文件
```

---

## 38. 常用反模式 & 替代方案速查

| ❌ 旧写法（Node.js / npm）                    | ✅ Bun 内置替代                         |
|-----------------------------------------------|----------------------------------------|
| `import fs from "node:fs/promises"`           | `Bun.file()` / `Bun.write()`           |
| `import dotenv from "dotenv"; dotenv.config()`| 无需操作，Bun 自动加载 `.env`           |
| `import pg from "pg"`                         | `import { sql } from "bun"`            |
| `import mysql2 from "mysql2"`                 | `new SQL({ adapter: "mysql", ... })`   |
| `import better-sqlite3 from "better-sqlite3"` | `import { Database } from "bun:sqlite"`|
| `import ioredis from "ioredis"`               | `import { redis } from "bun"`          |
| `import @aws-sdk/client-s3`                   | `import { s3 } from "bun"`             |
| `import bcrypt from "bcrypt"`                 | `Bun.password.hash()` / `.verify()`    |
| `import glob from "glob"`                     | `new Bun.Glob(...).scan()`             |
| `import semver from "semver"`                 | `Bun.semver.satisfies()`               |
| `import nodemon`                              | `bun --hot run` / `bun --watch run`    |
| `import ts-node`                              | `bun run` 直接支持 TS                   |
| `import jest`                                 | `bun test` (bun:test)                  |
| `import esbuild` / webpack                    | `bun build`                            |
| `npm run`                                     | `bun run`                              |
| `npx`                                         | `bunx`                                 |
| `import child_process.exec`                   | `import { $ } from "bun"` (Shell)      |
| `import markdown-it`                          | `Bun.markdown.html()`                  |
| `import js-yaml`                              | import with `{ type: "yaml" }`         |
| `import jsonc-parser`                         | `Bun.JSONC.parse()`                    |
| `import cron`                                 | `import { cron } from "bun"`           |
| `import archiver` / tar                       | `new Bun.Archive()`                    |
| `import zlib`                                 | `Bun.gzipSync()` / `Bun.deflateSync()` |
| `import { Readable } from "stream"`           | `Bun.readableStreamTo...()`            |
| `import net` / `dgram`                        | `Bun.listen()` / `Bun.udpSocket()`     |

---

## 39. 压缩与解压 — `Bun.gzip` / `Bun.deflate`

> 基于 zlib，零依赖，比 `node:zlib` 更快

```ts
const data = new TextEncoder().encode("hello world hello world");

// gzip
const gzipped = Bun.gzipSync(data);                // Uint8Array
const original = Bun.gunzipSync(gzipped);          // Uint8Array

// deflate (更快，压缩率稍低)
const deflated = Bun.deflateSync(data);
const restored = Bun.inflateSync(deflated);

// 异步流式（处理大文件）
const source = Bun.file("./big.log").stream();
const compressed = source.pipeThrough(new CompressionStream("gzip"));
await Bun.write("./big.log.gz", compressed);
```

---

## 40. 流转换 — `Bun.readableStreamTo...()`

> 将 Web `ReadableStream` 一键转为常用格式，无需手动 `new Response(stream).text()`

```ts
const stream = fetch("https://api.example.com/data").then(r => r.body!);

const text   = await Bun.readableStreamToText(stream);
const json   = await Bun.readableStreamToJSON(stream);
const buffer = await Bun.readableStreamToArrayBuffer(stream);
const blob   = await Bun.readableStreamToBlob(stream);
const bytes  = await Bun.readableStreamToBytes(stream);   // Uint8Array
```

**`Bun.ArrayBufferSink` — 高性能流式拼接：**

```ts
const sink = new Bun.ArrayBufferSink();
sink.start({ stream: true, highWaterMark: 1024 * 1024 });

for await (const chunk of someStream) {
  sink.write(chunk);
}
const result = sink.end(); // ArrayBuffer
```

---

## 41. TCP / Unix Socket — `Bun.listen()` / `Bun.connect()`

```ts
import { listen, connect } from "bun";

// ---- 服务端 (TCP) ----
const server = listen({
  hostname: "0.0.0.0",
  port: 4000,
  socket: {
    open(socket)    { console.log("client connected"); },
    data(socket, data) { socket.write(`echo: ${data}`); },
    close(socket)   { console.log("client disconnected"); },
    error(socket, error) { console.error(error); },
  },
});

// ---- 客户端 (TCP) ----
const client = await connect({
  hostname: "127.0.0.1",
  port: 4000,
  socket: {
    open(socket)    { socket.write("hello"); },
    data(socket, data) { console.log("received:", data); },
  },
});

// Unix Domain Socket
const unixServer = listen({
  unix: "/tmp/my.sock",
  socket: { /* ... */ },
});
```

---

## 42. UDP — `Bun.udpSocket()`

```ts
const socket = await Bun.udpSocket({
  hostname: "0.0.0.0",
  port: 3000,
  datagram(socket, data, port, address) {
    console.log(`from ${address}:${port}:`, data);
    socket.send("pong", port, address);
  },
});

socket.send("ping", 3000, "127.0.0.1");
socket.close();
```

---

## 43. 更多实用工具函数

```ts
// 深度比较（比 JSON.stringify 对比更可靠）
Bun.deepEquals({ a: [1, 2] }, { a: [1, 2] }); // true

// 类似 Node util.inspect，用于调试输出
Bun.inspect({ nested: { value: 42 } }, { colors: true, depth: 3 });

// 查找 PATH 中的可执行文件（类似 which 命令）
Bun.which("node");      // "/usr/local/bin/node"
Bun.which("not-exist"); // null

// 主模块路径
Bun.main;               // "/abs/path/to/entry.ts"

// 版本信息
Bun.version;            // "1.2.4"
Bun.revision;           // "abc123..." (git commit hash)

// 强制垃圾回收（仅调试）
Bun.gc(true);           // 强制执行 full GC

// 高精度计时
const t0 = Bun.nanoseconds();
// ... 操作 ...
const t1 = Bun.nanoseconds();
console.log(`耗时 ${(t1 - t0) / 1e6} ms`);
```

---

## 44. `import.meta` 扩展

```ts
// 当前文件所在目录（绝对路径）
const dir = import.meta.dir;     // "/project/src/utils"

// 当前文件绝对路径
const path = import.meta.path;   // "/project/src/utils/helper.ts"

// 当前文件名
const file = import.meta.file;   // "helper.ts"

// 当前文件 URL
const url = import.meta.url;     // "file:///project/src/utils/helper.ts"

// 是否为主入口（直接运行该文件）
if (import.meta.main) {
  console.log("直接执行");
}
```

---

## 45. `Bun.serve()` 高级选项速查

```ts
Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",

  // 请求体大小限制（默认 128MB）
  maxRequestBodySize: 1024 * 1024 * 10, // 10MB

  // TLS（HTTPS）
  tls: {
    key:  Bun.file("./server.key"),
    cert: Bun.file("./server.crt"),
    ca:   Bun.file("./ca.pem"),      // 可选
  },

  // Unix Domain Socket（替代端口）
  unix: "/tmp/aeron.sock",

  // WebSocket
  websocket: { /* open / message / close / drain */ },

  // 错误处理
  error(error) {
    return new Response(`Internal Error: ${error.message}`, { status: 500 });
  },

  // 开发模式（自动响应 404 时显示目录结构）
  development: process.env.NODE_ENV !== "production",
});
```

---

> **更新日期**: 2026-04-20
> **覆盖 Bun 版本**: ≥ 1.2.x (up to 1.3.x)
> **原则**: 能用 Bun 内置的，绝不多装一个 npm 包
