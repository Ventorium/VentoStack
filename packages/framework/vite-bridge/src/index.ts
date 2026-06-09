/**
 * @ventostack/vite-bridge — 开发模式 Vite 桥接
 *
 * 在 Bun.serve() 中桥接 Vite dev server，实现单进程前后端合一开发。
 * 仅在开发模式（NODE_ENV !== "production"）下使用。
 *
 * @example
 * ```ts
 * import { createViteBridge } from "@ventostack/vite-bridge";
 * const bridge = await createViteBridge({ webDir: "./apps/admin/web" });
 * const app = createApp({ port: 9320, fetchFallback: bridge.fetchFallback });
 * ```
 */

export { createViteBridge } from "./vite-bridge";
export type { ViteBridgeOptions, ViteBridge, ViteBridgeLogger } from "./types";
