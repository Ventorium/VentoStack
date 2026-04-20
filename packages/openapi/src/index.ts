// ============================================================
// @aeron/openapi — Public API
// ============================================================

// Schema builders
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

// Generator
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

// Route metadata
export { defineRouteDoc, routesToOpenAPI } from "./decorators";

export type { RouteMetadata } from "./decorators";
