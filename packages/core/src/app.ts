// @aeron/core - 应用入口

import { AeronError } from "./errors";
import { createLifecycle, type Lifecycle, type LifecycleHook } from "./lifecycle";
import type { Middleware } from "./middleware";
import type { Plugin } from "./plugin";
import { createRouter, type Router, type CompiledRoutes } from "./router";

export interface AppConfig {
  port?: number;
  hostname?: string;
}

export interface AeronApp {
  readonly router: Router;
  readonly lifecycle: Lifecycle;
  use(item: Plugin | Middleware): AeronApp;
  listen(port?: number): Promise<void>;
  close(): Promise<void>;
}

export function createApp(config?: AppConfig): AeronApp {
  const router = createRouter();
  const lifecycle = createLifecycle();
  const globalMiddleware: Middleware[] = [];
  const plugins: Plugin[] = [];

  let server: ReturnType<typeof Bun.serve> | null = null;
  let activeRequests = 0;
  let isClosing = false;
  let sigTermHandler: (() => void) | null = null;

  function defaultErrorHandler(error: unknown): Response {
    if (error instanceof AeronError) {
      return new Response(
        JSON.stringify({ error: error.errorCode, message: error.message }),
        {
          status: error.code,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    // 生产环境不暴露内部错误细节
    return new Response(
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "Internal Server Error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

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

  const app: AeronApp = {
    router,
    lifecycle,

    use(item: Plugin | Middleware): AeronApp {
      if (typeof item === "function") {
        globalMiddleware.push(item);
      } else if (
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        "install" in item
      ) {
        plugins.push(item);
      }
      return app;
    },

    async listen(port?: number): Promise<void> {
      // 安装插件
      for (const plugin of plugins) {
        await plugin.install(app);
      }

      await lifecycle.runBeforeStart();

      const compiled = router.compile(globalMiddleware);
      const wrapped = wrapRoutes(compiled);

      const listenPort = port ?? config?.port ?? 3000;
      const hostname = config?.hostname ?? "0.0.0.0";

      server = Bun.serve({
        port: listenPort,
        hostname,
        routes: wrapped,
        fetch() {
          return new Response(
            JSON.stringify({ error: "NOT_FOUND", message: "Not Found" }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      });

      // SIGTERM 优雅关闭
      sigTermHandler = () => {
        app.close();
      };
      process.on("SIGTERM", sigTermHandler);

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

      if (sigTermHandler) {
        process.removeListener("SIGTERM", sigTermHandler);
        sigTermHandler = null;
      }
    },
  };

  return app;
}
