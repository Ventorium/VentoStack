// @aeron/openapi - Swagger UI 内嵌页面

export interface SwaggerUIOptions {
  /** OpenAPI JSON 端点路径 */
  specUrl?: string;
  /** 页面标题 */
  title?: string;
  /** Swagger UI CDN 版本 */
  version?: string;
}

/**
 * 生成 Swagger UI HTML 页面。
 * 使用 CDN 加载 Swagger UI，不需要本地依赖。
 */
export function generateSwaggerUI(options: SwaggerUIOptions = {}): string {
  const {
    specUrl = "/openapi.json",
    title = "API Documentation",
    version = "5.17.14",
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "StandaloneLayout"
    });
  </script>
</body>
</html>`;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 创建 Swagger UI 路由处理器。
 * 返回一个 handler 可以直接用于路由。
 */
export function createSwaggerUIHandler(options: SwaggerUIOptions = {}): () => Response {
  const html = generateSwaggerUI(options);
  return () =>
    new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}
