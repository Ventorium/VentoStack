/**
 * @ventostack/openapi — Scalar 内嵌页面
 *
 * 提供基于 CDN 的 Scalar API 参考文档 UI 生成、路由处理器和插件。
 * 无需本地依赖，直接通过 CDN 加载 Scalar。
 */

import type { Plugin, VentoStackApp } from "@ventostack/core";

/** Scalar UI 配置选项 */
export interface ScalarUIOptions {
  /** OpenAPI JSON 端点路径 */
  specUrl?: string;
  /** 页面标题 */
  title?: string;
  /** Scalar CDN 版本 */
  version?: string;
  /** Scalar 挂载路径 */
  path?: string;
}

/**
 * 生成 Scalar HTML 页面
 * @param options - Scalar UI 配置选项
 * @returns 完整 HTML 字符串
 */
export function generateScalarUI(options: ScalarUIOptions = {}): string {
  const { specUrl = "/openapi.json", title = "API Documentation", version = "latest" } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(title)}</title>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${version}"></script>
  <script>
    Scalar.createApiReference('#app', {
      url: ${JSON.stringify(specUrl)},
    });
  </script>
</body>
</html>`;
}

/**
 * HTML 属性转义，防止 XSS
 * @param s - 原始字符串
 * @returns 转义后的安全字符串
 */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 创建 Scalar 路由处理器
 * @param options - Scalar UI 配置选项
 * @returns 返回 HTML 响应的 handler 函数
 */
export function createScalarUIHandler(options: ScalarUIOptions = {}): () => Response {
  const html = generateScalarUI(options);
  return () =>
    new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

/**
 * 创建 Scalar UI 插件
 * @param options - Scalar UI 配置选项
 * @returns VentoStack 插件实例
 *
 * 自动注册 /docs 路由并在启动时打印访问地址。
 */
export function createScalarUIPlugin(options: ScalarUIOptions = {}): Plugin {
  const path = options.path ?? "/docs";
  return {
    name: "scalar-ui",
    install(app: VentoStackApp) {
      app.router.get(path, createScalarUIHandler(options));
      app.addUrl("Scalar UI", path);
    },
  };
}
