import { defineConfig } from "@doremijs/o2t";
export default defineConfig({
  // OpenAPI 文档在主端口（PORT，默认 9320）暴露，包含全部平台路由
  specUrl: "http://127.0.0.1:9320/openapi.json",
});
