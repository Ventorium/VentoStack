// @aeron/core - WebSocket 路由支持

import type { Context } from "./context";

export interface WSMessage {
  type: string;
  data: unknown;
}

export interface WSRoute {
  path: string;
  open?: (ws: WSConnection) => void;
  message: (ws: WSConnection, msg: string | Buffer) => void;
  close?: (ws: WSConnection, code: number, reason: string) => void;
  drain?: (ws: WSConnection) => void;
  /** 升级前校验，返回 false 拒绝连接 */
  upgrade?: (req: Request) => boolean | Promise<boolean>;
  /** 附加到 ws.data 的数据 */
  data?: (req: Request) => Record<string, unknown>;
}

export interface WSConnection {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;
  readonly data: Record<string, unknown>;
  readonly readyState: number;
}

export interface WebSocketRouter {
  ws(path: string, handlers: Omit<WSRoute, "path">): WebSocketRouter;
  routes(): readonly WSRoute[];
  /** 生成 Bun.serve() websocket 配置 */
  compile(): {
    routes: WSRoute[];
    upgrade: (req: Request, server: { upgrade(req: Request, opts?: { data?: unknown }): boolean }) => boolean;
    handlers: {
      open: (ws: WSConnection) => void;
      message: (ws: WSConnection, msg: string | Buffer) => void;
      close: (ws: WSConnection, code: number, reason: string) => void;
      drain: (ws: WSConnection) => void;
    };
  };
}

export function createWebSocketRouter(): WebSocketRouter {
  const wsRoutes: WSRoute[] = [];

  const router: WebSocketRouter = {
    ws(path, handlers) {
      wsRoutes.push({ path, ...handlers });
      return router;
    },

    routes() {
      return wsRoutes;
    },

    compile() {
      function findRoute(path: string): WSRoute | undefined {
        return wsRoutes.find((r) => {
          if (r.path === path) return true;
          // 简单通配符匹配
          if (r.path.endsWith("/*")) {
            return path.startsWith(r.path.slice(0, -1));
          }
          return false;
        });
      }

      return {
        routes: wsRoutes,
        upgrade(req, server) {
          const url = new URL(req.url);
          const route = findRoute(url.pathname);
          if (!route) return false;
          const data = route.data ? route.data(req) : {};
          (data as Record<string, unknown>).__wsPath = url.pathname;
          return server.upgrade(req, { data });
        },
        handlers: {
          open(ws) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.open?.(ws);
          },
          message(ws, msg) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.message(ws, msg);
          },
          close(ws, code, reason) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.close?.(ws, code, reason);
          },
          drain(ws) {
            const path = (ws.data as Record<string, unknown>).__wsPath as string;
            const route = findRoute(path);
            route?.drain?.(ws);
          },
        },
      };
    },
  };

  return router;
}
