import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import UnoCSS from "unocss/vite";
import { defineConfig, loadEnv } from "vite";
import type { Plugin as EsbuildPlugin } from "esbuild";
import pages from "vite-plugin-pages";
import svgr from "vite-plugin-svgr";

// react / react-dom 是纯 CommonJS，入口是「间接再导出」：
//   module.exports = require('./cjs/react.development.js')
// esbuild 无法静态分析这种形状，预构建产物会退化成只有 default 的包装器
// （`export default require_react()`），具名导出全部丢失，
// 于是 import { useContext } from 'react' 得到 undefined，
// 运行期报 "Invalid hook call / Cannot read properties of null (reading 'useContext')"。
//
// 修法：在预构建阶段把入口重定向到具体的 cjs 实现文件 —— 那里是
// `exports.useContext = ...` 直接赋值，esbuild 能静态分析并导出完整具名符号。
// 仅作用于 optimizeDeps（dev 服务器），生产构建走 rollup，不受影响。
function createReactCjsEntryPlugin(): EsbuildPlugin {
  const req = createRequire(import.meta.url);
  const reactDir = join(req.resolve("react/package.json"), "..");
  const reactDomDir = join(req.resolve("react-dom/package.json"), "..");
  // esbuild 预构建时看到的是裸包名，按裸包名映射到具体 cjs 实现文件
  const redirects: Record<string, string> = {
    react: join(reactDir, "cjs/react.development.js"),
    "react/jsx-runtime": join(reactDir, "cjs/react-jsx-runtime.development.js"),
    "react/jsx-dev-runtime": join(reactDir, "cjs/react-jsx-dev-runtime.development.js"),
    "react-dom": join(reactDomDir, "cjs/react-dom.development.js"),
    "react-dom/client": join(reactDomDir, "cjs/react-dom-client.development.js"),
  };
  return {
    name: "vento-react-cjs-entry",
    setup(build) {
      build.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
        const target = redirects[args.path];
        return target ? { path: target } : null;
      });
    },
  };
}

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
      // antd / @ant-design/icons 等把 react 声明为 peer，但 Vite 预构建时若各自解析到
      // 不同的 react 实例，产物里会出现多份 React 运行时，导致
      // "Invalid hook call / Cannot read properties of null (reading 'useContext')"。
      dedupe: ["react", "react-dom"],
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
    optimizeDeps: {
      // 必须把页面会**动态导入**的外部包一次性列全。
      // 否则 Vite 会在你访问页面时才「发现」新依赖、优化完再强制整页 reload，
      // 动态 import 在那个窗口里失败，表现为
      // "Failed to fetch dynamically imported module" 或白屏。
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-router",
        "react-router-dom",
        "zustand",
        "antd",
        "@ant-design/icons",
        "@simplewebauthn/browser",
        "@doremijs/o2t-client",
        "clsx",
        "dayjs",
        "echarts-for-react",
        "@milkdown/core",
        "@milkdown/crepe",
        "@milkdown/kit",
        "@milkdown/react",
        "@xyflow/react",
      ],
      esbuildOptions: {
        plugins: [createReactCjsEntryPlugin()],
      },
    },
  };
});
