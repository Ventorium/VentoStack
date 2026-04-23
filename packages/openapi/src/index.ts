// ============================================================
// @ventostack/openapi — 公共 API 入口
//
// 提供 OpenAPI 3.0 文档生成、Schema 构建、路由元数据、UI 渲染、
// API 版本管理、Diff 计算与废弃策略等完整能力。
// ============================================================

// ---- Schema 构建函数 ----
export {
  schemaString,
  schemaNumber,
  schemaInteger,
  schemaBoolean,
  schemaArray,
  schemaObject,
  schemaEnum,
  schemaRef,
} from "./schema-builder";

export type {
  OpenAPISchema,
  SchemaStringOptions,
  SchemaNumberOptions,
  SchemaIntegerOptions,
  SchemaBooleanOptions,
  SchemaArrayOptions,
  SchemaObjectOptions,
  SchemaEnumOptions,
} from "./schema-builder";

// ---- 文档生成器 ----
export { createOpenAPIGenerator, toYAML } from "./generator";

export type {
  OpenAPIInfo,
  OpenAPIServer,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPIOperation,
  OpenAPIPath,
  OpenAPITag,
  OpenAPIDocument,
  OpenAPIGenerator,
} from "./generator";

// ---- 路由元数据 ----
export { defineRouteDoc, routesToOpenAPI, syncRouterToOpenAPI } from "./decorators";

export type { SyncRouterToOpenAPIOptions } from "./decorators";

export type { RouteMetadata } from "./decorators";

// ---- 应用级一键接入 ----
export { createOpenAPIPlugin, setupOpenAPI } from "./setup";
export type { OpenAPISetupOptions } from "./setup";

// ---- Swagger UI ----
export { generateSwaggerUI, createSwaggerUIHandler, createSwaggerUIPlugin } from "./swagger-ui";
export type { SwaggerUIOptions } from "./swagger-ui";

// ---- Scalar UI ----
export { generateScalarUI, createScalarUIHandler, createScalarUIPlugin } from "./scalar-ui";
export type { ScalarUIOptions } from "./scalar-ui";

// ---- API 版本管理 ----
export { apiVersion, parseVersionFromAccept } from "./api-version";
export type { APIVersionOptions } from "./api-version";

// ---- 文档版本管理 ----
export { createDocVersionManager } from "./doc-version";
export type { DocVersionManager, DocVersion, VersionDiff } from "./doc-version";

// ---- API Diff ----
export { computeAPIDiff, generateDiffReport } from "./api-diff";
export type { APIDiffResult, APIDiffEntry } from "./api-diff";

// ---- 废弃与兼容策略 ----
export {
  createDeprecationManager,
  createCompatibilityGuard,
  DEFAULT_COMPATIBILITY_POLICY,
} from "./deprecation";
export type { DeprecationManager, DeprecationNotice, CompatibilityPolicy } from "./deprecation";
