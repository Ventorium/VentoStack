// @ventostack/core - 应用入口

import { VentoStackError } from "./errors";
import { type Lifecycle, createLifecycle } from "./lifecycle";
import type { Middleware } from "./middleware";
import type { Plugin } from "./plugin";
import { type CompiledRoutes, type Router, createRouter } from "./router";
import { RESET, ansi, COLORS } from "./color";

/**
 * 判断给定对象是否为 Router 实例
 * @param item - 待判断的对象
 * @returns 若 item 为 Router 则返回 true
 */
function isRouter(item: unknown): item is Router {
  return (
    typeof item === "object" &&
    item !== null &&
    "compile" in item &&
    "routes" in item &&
    typeof (item as Router).compile === "function" &&
    typeof (item as Router).routes === "function"
  );
}

/** 应用配置选项 */
export interface AppConfig {
  /** 监听端口，默认 3000 */
  port?: number;
  /** 监听主机名，默认 0.0.0.0 */
  hostname?: string;
}

/** 应用可访问地址条目 */
export interface AppUrl {
  /** 地址标签 */
  label: string;
  /** 地址路径 */
  path: string;
}

/** VentoStack 应用实例接口 */
export interface VentoStackApp {
  /** 路由实例 */
  readonly router: Router;
  /** 生命周期管理器 */
  readonly lifecycle: Lifecycle;
  /** 已注册的可访问地址列表 */
  readonly urls: ReadonlyArray<AppUrl>;
  /**
   * 注册插件、中间件或路由
   * @param item - Plugin、Middleware 或 Router
   * @returns 当前应用实例，支持链式调用
   */
  use(item: Plugin | Middleware | Router): VentoStackApp;
  /**
   * 启动 HTTP 服务
   * @param port - 可选覆盖端口
   */
  listen(port?: number): Promise<void>;
  /** 优雅关闭服务 */
  close(): Promise<void>;
  /**
   * 添加可访问地址（用于启动后打印）
   * @param label - 地址标签
   * @param path - 路径
   */
  addUrl(label: string, path: string): void;
}

/**
 * 创建 VentoStack 应用实例
 * @param config - 应用配置
 * @returns VentoStackApp 实例
 */
export function createApp(config?: AppConfig): VentoStackApp {
  const router = createRouter();
  const lifecycle = createLifecycle();
  const globalMiddleware: Middleware[] = [];
  const plugins: Plugin[] = [];
  const urls: AppUrl[] = [];

  let server: ReturnType<typeof Bun.serve> | null = null;
  let activeRequests = 0;
  let isClosing = false;
  let sigTermHandler: (() => void) | null = null;
  let sigIntHandler: (() => void) | null = null;
  let shutdownPromise: Promise<void> | null = null;

  /**
   * 默认错误处理函数
   * @param error - 捕获到的错误对象
   * @returns 统一格式的 Response
   */
  function defaultErrorHandler(error: unknown): Response {
    if (error instanceof VentoStackError) {
      return new Response(JSON.stringify({ error: error.errorCode, message: error.message }), {
        status: error.code,
        headers: { "Content-Type": "application/json" },
      });
    }
    // 生产环境不暴露内部错误细节
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "服务器内部错误",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * 包装编译后的路由处理器，增加关闭状态与错误捕获
   * @param compiled - 编译后的路由表
   * @returns 包装后的路由表
   */
  function wrapRoutes(compiled: CompiledRoutes): CompiledRoutes {
    const wrapped: CompiledRoutes = {};

    for (const [path, handlerOrMethods] of Object.entries(compiled)) {
      const methods: Record<string, (req: Request) => Response | Promise<Response>> = {};
      for (const [method, handler] of Object.entries(
        handlerOrMethods as Record<string, (req: Request) => Response | Promise<Response>>,
      )) {
        methods[method] = wrapHandler(handler);
      }
      wrapped[path] = methods;
    }

    return wrapped;
  }

  /**
   * 包装单个请求处理器，统计活跃请求并统一捕获异常
   * @param handler - 原始请求处理器
   * @returns 包装后的处理器
   */
  function wrapHandler(
    handler: (req: Request) => Response | Promise<Response>,
  ): (req: Request) => Promise<Response> {
    return async (req: Request): Promise<Response> => {
      if (isClosing) {
        return new Response("Service Unavailable", { status: 503 });
      }
      activeRequests++;
      try {
        return await handler(req);
      } catch (error) {
        return defaultErrorHandler(error);
      } finally {
        activeRequests--;
      }
    };
  }

  function beginSignalShutdown(exitCode: number): void {
    shutdownPromise ??= app.close().then(
      () => {
        process.exit(exitCode);
      },
      (error) => {
        console.error("Failed to shut down gracefully:", error);
        process.exit(1);
      },
    );
  }

  const app: VentoStackApp = {
    router,
    lifecycle,
    get urls() {
      return urls;
    },

    use(item: Plugin | Middleware | Router): VentoStackApp {
      if (typeof item === "function") {
        globalMiddleware.push(item);
      } else if (isRouter(item)) {
        app.router.merge(item);
      } else if (typeof item === "object" && item !== null && "name" in item && "install" in item) {
        plugins.push(item);
      }
      return app;
    },

    addUrl(label: string, path: string): void {
      urls.push({ label, path });
    },

    async listen(port?: number): Promise<void> {
      // 安装插件
      for (const plugin of plugins) {
        await plugin.install(app);
      }

      await lifecycle.runBeforeStart();
      await lifecycle.runBeforeRouteCompile();

      const compiled = router.compile(globalMiddleware);
      const wrapped = wrapRoutes(compiled);

      const listenPort = port ?? config?.port ?? 3000;
      const hostname = config?.hostname ?? "0.0.0.0";

      server = Bun.serve({
        port: listenPort,
        hostname,
        routes: wrapped,
        fetch() {
          return new Response(JSON.stringify({ error: "NOT_FOUND", message: "资源不存在" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        },
      });

      // 打印启动 Banner
      const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
      const baseUrl = `http://${displayHost}:${listenPort}`;
      const accent = ansi(COLORS.info);
      const tag = ansi(COLORS.tag);
      console.log(`
${tag}██╗   ██╗███████╗███╗   ██╗████████╗ ██████╗ ███████╗████████╗ █████╗  ██████╗██╗  ██╗${RESET}
${tag}██║   ██║██╔════╝████╗  ██║╚══██╔══╝██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝${RESET}
${tag}██║   ██║█████╗  ██╔██╗ ██║   ██║   ██║   ██║███████╗   ██║   ███████║██║     █████╔╝ ${RESET}
${tag}╚██╗ ██╔╝██╔══╝  ██║╚██╗██║   ██║   ██║   ██║╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ${RESET}
${tag} ╚████╔╝ ███████╗██║ ╚████║   ██║   ╚██████╔╝███████║   ██║   ██║  ██║╚██████╗██║  ██╗${RESET}
${tag}  ╚═══╝  ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝${RESET}

  ➜  Local:   ${accent}${baseUrl}${RESET}`);
      for (const url of urls) {
        // eslint-disable-next-line no-console
        console.log(`  ➜  ${url.label}: ${accent}${baseUrl}${url.path}${RESET}`);
      }
      console.log();

      // SIGTERM / SIGINT 优雅关闭
      sigTermHandler = () => {
        beginSignalShutdown(0);
      };
      sigIntHandler = () => {
        beginSignalShutdown(0);
      };
      process.on("SIGTERM", sigTermHandler);
      process.on("SIGINT", sigIntHandler);

      await lifecycle.runAfterStart();
    },

    async close(): Promise<void> {
      if (!server) return;
      isClosing = true;

      // 等待活跃请求完成，最多 30 秒
      const deadline = Date.now() + 30_000;
      while (activeRequests > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await lifecycle.runBeforeStop();

      server.stop(true);
      server = null;
      isClosing = false;
      shutdownPromise = null;

      if (sigTermHandler) {
        process.removeListener("SIGTERM", sigTermHandler);
        sigTermHandler = null;
      }
      if (sigIntHandler) {
        process.removeListener("SIGINT", sigIntHandler);
        sigIntHandler = null;
      }
    },
  };

  return app;
}
