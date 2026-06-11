/**
 * vite-bridge.ts — Vite Bridge 工厂函数
 *
 * 创建 Vite dev server（middlewareMode），通过 connect-adapter 桥接到 Bun.serve()。
 * 仅在开发模式下使用（NODE_ENV !== "production"）。
 */

import type { Server } from "bun";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { ViteBridgeOptions, ViteBridge, ViteBridgeLogger } from "./types";
import { connectBridge } from "./connect-adapter";

// ─── 默认值 ───────────────────────────────────────────

const DEFAULT_HMR_PORT = 9323;
const DEFAULT_SKIP_PREFIXES = ["/api/"];

/** console 兜底日志器 */
const consoleLogger: ViteBridgeLogger = {
  info: (msg: string) => console.log(`[vite-bridge] ${msg}`),
  warn: (msg: string) => console.warn(`[vite-bridge] ${msg}`),
  error: (msg: string) => console.error(`[vite-bridge] ${msg}`),
};

// ─── Vite Dev Server 类型（懒加载） ───────────────────

interface ViteDevServerLike {
  middlewares: {
    handle: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  };
  close: () => Promise<void>;
}

// ─── 公共 API ─────────────────────────────────────────

/**
 * 创建 Vite Bridge
 *
 * @param options - 配置选项
 * @returns ViteBridge 实例，包含 fetchFallback、restart、close 方法
 * @throws 如果 NODE_ENV === "production"
 *
 * @example
 * ```ts
 * const bridge = await createViteBridge({ webDir: "./apps/admin/web" });
 * const app = createApp({ port: 9320, fetchFallback: bridge.fetchFallback });
 * ```
 */
export async function createViteBridge(options: ViteBridgeOptions): Promise<ViteBridge> {
  // 1. 生产环境保护
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "@ventostack/vite-bridge 只能在开发模式下使用。" +
      "生产模式请使用静态文件服务（将前端 dist 复制到 public/ 目录）。",
    );
  }

  const {
    webDir,
    hmrPort = DEFAULT_HMR_PORT,
    hmrHost,
    skipPrefixes = DEFAULT_SKIP_PREFIXES,
    viteConfigOverrides,
    logger = consoleLogger,
  } = options;

  // 2. 动态导入 Vite（从 webDir 的 node_modules 解析，零编译期依赖）
  logger.info(`正在初始化 Vite dev server (root: ${webDir})...`);
  const vite = await import(join(webDir, "node_modules", "vite"));

  // 3. 加载用户的 vite.config.ts 并合并覆盖
  const fileConfig = await vite.loadConfigFromFile(
    { command: "serve", mode: "development" },
    undefined, // 自动查找 vite.config.ts
    webDir,
  );

  // 4. Vite 插件：修复 HMR 客户端中的 0.0.0.0 为 location.hostname
  const fixHmrHostPlugin: Record<string, unknown> = {
    name: "vite-bridge:fix-hmr-host",
    configureServer(server: { middlewares: { use: (path: string, handler: (req: { url: string }, res: { writeHead: (s: number, h: Record<string, string>) => void; end: (body: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use("/@vite/client", (req, res, next) => {
        // 拦截 /@vite/client 请求，在响应中将 0.0.0.0 替换为 location.hostname
        const originalEnd = res.end.bind(res);
        const chunks: string[] = [];
        res.end = function (body?: string) {
          if (typeof body === "string") {
            chunks.push(body);
            const joined = chunks.join("");
            // 替换 0.0.0.0 为 importMetaUrl.hostname（客户端会用 location.hostname）
            const fixed = joined.replace(/"0\.0\.0\.0"/g, "importMetaUrl.hostname");
            return originalEnd(fixed);
          }
          return originalEnd(body);
        } as typeof res.end;
        next();
      });
    },
  };

  // 5. 创建 Vite dev server 的内部函数
  async function createViteServer(): Promise<ViteDevServerLike> {
    // 合并：文件配置 → 我们的覆盖 → 用户覆盖
    const existingPlugins = Array.isArray(fileConfig?.config?.plugins)
      ? [...fileConfig!.config!.plugins!]
      : [];

    const server = await vite.createServer({
      ...fileConfig?.config,
      root: webDir,
      configFile: false, // 已手动加载，不再重复加载
      plugins: [...existingPlugins, fixHmrHostPlugin],
      server: {
        ...(typeof fileConfig?.config?.server === "object" ? fileConfig.config.server : {}),
        middlewareMode: true,
        hmr: {
          ...(typeof fileConfig?.config?.server === "object" && typeof fileConfig.config.server.hmr === "object"
            ? fileConfig.config.server.hmr
            : {}),
          port: hmrPort,
          // 服务器绑定到 0.0.0.0 以接受远程连接
          host: hmrHost ?? "0.0.0.0",
          clientPort: hmrPort,
        },
      },
      appType: "spa",
      logLevel: "warn",
      ...viteConfigOverrides,
    } as ConstructorParameters<typeof vite.createServer>[0]);

    return {
      middlewares: server.middlewares,
      close: () => server.close(),
    };
  }

  // 4. 初始创建
  let currentServer = await createViteServer();
  let closed = false;

  // 5. 构建返回值
  return {
    /** HMR 端口 */
    get hmrPort(): number {
      return hmrPort;
    },

    /** fetch 回退处理器 */
    async fetchFallback(request: Request, _server: Server): Promise<Response | null> {
      if (closed) return null;

      // 跳过指定前缀路径
      const pathname = new URL(request.url).pathname;
      for (const prefix of skipPrefixes) {
        if (pathname.startsWith(prefix)) return null;
      }

      try {
        return await connectBridge(request, (req, res, next) => {
          currentServer.middlewares.handle(req, res, next);
        });
      } catch (err) {
        logger.error(`请求处理异常: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },

    /** 重启 Vite dev server */
    async restart(): Promise<void> {
      logger.info("正在重启 Vite dev server...");
      try {
        await currentServer.close();
      } catch (err) {
        logger.warn(`关闭旧 Vite server 时出错: ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        currentServer = await createViteServer();
        closed = false;
        logger.info("Vite dev server 已重启");
      } catch (err) {
        logger.error(`创建新 Vite server 失败: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },

    /** 关闭 Vite dev server */
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      logger.info("正在关闭 Vite dev server...");
      try {
        await currentServer.close();
        logger.info("Vite dev server 已关闭");
      } catch (err) {
        logger.warn(`关闭 Vite server 时出错: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
