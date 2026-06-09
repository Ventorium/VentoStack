/**
 * @ventostack/vite-bridge — 类型定义
 *
 * 开发模式下将 Vite dev server 桥接到 Bun.serve() 的 Fetch API，
 * 实现单进程前后端合一开发。
 */

import type { Server } from "bun";

// ─── 配置接口 ─────────────────────────────────────────

/** 日志器接口（与框架 logger 对齐） */
export interface ViteBridgeLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** createViteBridge 配置选项 */
export interface ViteBridgeOptions {
  /** 前端项目根目录（包含 index.html 和 vite.config.ts） */
  webDir: string;
  /** HMR WebSocket 端口（默认 9323） */
  hmrPort?: number;
  /** HMR WebSocket 主机（不设置则 Vite 使用 location.hostname，远程访问时设为实际 IP） */
  hmrHost?: string;
  /** 需要跳过的路径前缀，这些请求不会被 Vite 处理（默认 ["/api/"]） */
  skipPrefixes?: string[];
  /** Vite 配置覆盖（合并到 vite.createServer 配置） */
  viteConfigOverrides?: Record<string, unknown>;
  /** 日志器（可选，不传则用 console） */
  logger?: ViteBridgeLogger;
}

// ─── 返回值接口 ───────────────────────────────────────

/** createViteBridge 返回的桥接实例 */
export interface ViteBridge {
  /**
   * fetch 回退处理器。
   * 传给 createApp({ fetchFallback }) ，当请求不匹配任何 API 路由时调用。
   * 返回 null 表示未处理（降级到框架默认 404）。
   */
  fetchFallback: (request: Request, server: Server<unknown>) => Promise<Response | null>;

  /** 重启 Vite dev server（关闭旧的，创建新的） */
  restart: () => Promise<void>;

  /** 关闭 Vite dev server 并释放资源 */
  close: () => Promise<void>;

  /** HMR WebSocket 端口号（用于打印启动 banner） */
  readonly hmrPort: number;
}
