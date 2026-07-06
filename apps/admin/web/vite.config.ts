import { resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import UnoCSS from "unocss/vite";
import { defineConfig, loadEnv } from "vite";
import pages from "vite-plugin-pages";
import svgr from "vite-plugin-svgr";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // HMR WebSocket 配置：在反向代理/远程开发场景下，外部访问端口/协议可能与 Vite 监听端口不同。
  // 例：外部 https://stack.erguotou.me:9323 -> 内部 Vite :9321，需要设置
  // VITE_HMR_PROTOCOL=wss VITE_HMR_HOST=stack.erguotou.me VITE_HMR_CLIENT_PORT=9323
  const hmrProtocol = env.VITE_HMR_PROTOCOL as "wss" | "ws" | undefined;
  const hmrHost = env.VITE_HMR_HOST;
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined;

  return {
    plugins: [
      react(),
      UnoCSS({ configFile: resolve(__dirname, "uno.config.ts") }),
      svgr(),
      pages({
        extensions: ["tsx"],
        exclude: ["**/{components,assets,blocks,hooks,store,__tests__}/**/*.*", "**/_*.*"],
        routeStyle: "next",
        importMode: "async",
        dirs: "src/pages",
        resolver: "react",
      })
    ],
    resolve: {
      alias: [{ find: "@", replacement: resolve(__dirname, "./src") }],
    },
    server: {
      host: "0.0.0.0",
      port: 9321,
      allowedHosts: ['stack.erguotou.me'],
      hmr: {
        protocol: hmrProtocol,
        host: hmrHost,
        clientPort: hmrClientPort,
      },
    },
  };
});
