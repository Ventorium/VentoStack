# @ventostack/openapi

VentoStack 的 API 契约与文档工具，将 Router 元数据转换为 OpenAPI 3.1 文档和交互式文档页面。

## 核心能力

- OpenAPI 3.1 文档构建与 YAML 输出
- 从 VentoStack Router 同步路由、Schema 和响应定义
- Swagger UI 与 Scalar UI
- API 版本解析和版本文档管理
- API 差异分析、兼容性策略和弃用管理
- 路由级文档插件和服务端处理器

## 使用边界

文档内容以路由 Schema 为事实来源。生产环境是否暴露文档端点，应由应用根据环境和权限显式控制。

```ts
import { setupOpenAPI } from "@ventostack/openapi";

setupOpenAPI(app, {
  info: { title: "Example API", version: "1.0.0" },
});
```
