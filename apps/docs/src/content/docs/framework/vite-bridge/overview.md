---
title: Vite Bridge 模块
description: 开发模式下将 Vite dev server 桥接到 Bun.serve()，实现单进程前后端合一的本地开发体验
---

# Vite Bridge 模块

`@ventostack/vite-bridge` 在开发模式下把 Vite dev server 以 `middlewareMode` 启动，再通过 connect 适配器桥接到 `Bun.serve()` 的 `fetchFallback`。这样后端 API 与前端 HMR 在同一个进程、同一个端口下工作，浏览器不再有跨域问题，也不需要分别启动两个服务。

:::caution
本模块**仅限开发模式**。`NODE_ENV === "production"` 时调用 `createViteBridge()` 会直接抛错。生产环境请把前端 `dist` 复制到后端 `public/` 目录，走静态文件服务。
:::

## 核心概念

| 概念 | 说明 |
|------|------|
| `middlewareMode` | Vite 不监听端口，只暴露 Connect 中间件栈 |
| `connectBridge` | 把 Fetch API 的 `Request`/`Response` 与 Node 的 `IncomingMessage`/`ServerResponse` 双向转换 |
| `fetchFallback` | 由 VentoStack `core` 提供，挂载桥接后的回退处理器 |

请求分流逻辑：

```
Bun.serve 收到请求
  ├─ 命中 API 路由（/api/**）   → 后端路由处理，Vite 不参与
  └─ 未命中任何路由
       ├─ skipPrefixes 命中的前缀 → 返回 null，降级为框架默认 404
       └─ 其余请求                → 交给 Vite 中间件栈（模块转换、HMR、资源服务）
```

## 基本用法

```ts
import { createApp } from "@ventostack/core";
import { createViteBridge } from "@ventostack/vite-bridge";

const bridge = await createViteBridge({
  webDir: "./apps/admin/web",
});

const app = createApp({
  port: 9320,
  fetchFallback: bridge.fetchFallback,
});

await app.listen();

// 优雅关闭时释放 Vite 资源
app.lifecycle.onBeforeStop(async () => {
  await bridge.close();
});
```

## 配置项

```ts
interface ViteBridgeOptions {
  /** 前端项目根目录（包含 index.html 和 vite.config.ts） */
  webDir: string;
  /** HMR WebSocket 端口（默认 9323） */
  hmrPort?: number;
  /** HMR WebSocket 主机；远程访问时设为实际 IP，不设置则用 location.hostname */
  hmrHost?: string;
  /** 跳过的路径前缀，这些请求不进 Vite（默认 ["/api/"]） */
  skipPrefixes?: string[];
  /** Vite 配置覆盖，合并到 vite.createServer 的参数 */
  viteConfigOverrides?: Record<string, unknown>;
  /** 日志器，不传则使用 console */
  logger?: ViteBridgeLogger;
}
```

### 零编译期依赖

Vite 不是本包的运行时依赖。`createViteBridge()` 在运行时从 `webDir/node_modules/vite` 动态导入：

```ts
const vite = await import(join(webDir, "node_modules", "vite"));
```

这样前端用什么构建工具、哪个版本，后端包都不需要感知，也不会把 Vite 打进生产依赖树。

### 配置合并顺序

```
vite.config.ts 原有配置  →  桥接层覆盖  →  用户 viteConfigOverrides
```

桥接层强制设置的部分：`root = webDir`、`configFile: false`（已手动加载，避免重复）、`middlewareMode: true`、`appType: "spa"`、`logLevel: "warn"`。

## 返回值

```ts
interface ViteBridge {
  /** 传给 createApp({ fetchFallback })；返回 null 表示未处理 */
  fetchFallback: (request: Request, server: Server<unknown>) => Promise<Response | null>;
  /** 重启 Vite dev server（关闭旧的，创建新的） */
  restart: () => Promise<void>;
  /** 关闭 Vite dev server 并释放资源 */
  close: () => Promise<void>;
  /** HMR WebSocket 端口号，用于打印启动 banner */
  readonly hmrPort: number;
}
```

`restart()` 用于修改了 `vite.config.ts` 之后的场景：桥接层会先关闭旧 server 再重新读取配置创建新的。

## HMR 远程访问

Vite 的 HMR 客户端在服务端绑定 `0.0.0.0` 时会把连接地址写成字面量 `"0.0.0.0"`，浏览器从其他机器访问时会连到自己。桥接层内置了一个插件拦截 `/@vite/client` 的响应，把它替换成 `importMetaUrl.hostname`，使客户端回退到浏览器当前域名。

如果远程访问仍然连不上 HMR WebSocket，显式设置 `hmrHost` 为实际可达 IP：

```ts
await createViteBridge({
  webDir: "./apps/admin/web",
  hmrPort: 9323,
  hmrHost: "192.168.1.10",
});
```

## 与 admin 开发流程的关系

`apps/admin/api` 在开发模式下接入桥接，使 `/api/*` 由后端处理、其余路径由 Vite 处理，两者共用一个端口。生产镜像里 `NODE_ENV=production`，该分支不会执行，前端产物由 Dockerfile 复制到 `apps/admin/api/public/`，改由 SPA fallback 中间件服务。

## 错误处理

- 创建失败（Vite 未安装、配置加载失败）会在 `createViteBridge()` 阶段抛错，属于启动期失败，应当 fail-fast。
- 请求处理期间的异常会被捕获并记录到 logger，`fetchFallback` 返回 `null`，由框架降级为默认 404，不会让整个进程崩溃。
- `close()` 对关闭异常只记录 warn 不抛出，避免与主流程的优雅关闭互相阻塞。

## 相关模块

- [core 模块](./core/overview) — `createApp` 的 `fetchFallback` 与生命周期钩子
- [应用开发约定](../../admin/development) — admin 项目的开发命令与目录约定