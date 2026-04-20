// ============================================================
// @aeron/openapi — Schema Builder
// OpenAPI 3.0 Schema 构建函数
// ============================================================

/** OpenAPI 3.0 Schema 对象 */
export interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: unknown[];
  description?: string;
  example?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  oneOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  $ref?: string;
}

export interface SchemaStringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  description?: string;
  example?: string;
}

export interface SchemaNumberOptions {
  minimum?: number;
  maximum?: number;
  format?: string;
  description?: string;
  example?: number;
}

export interface SchemaIntegerOptions {
  minimum?: number;
  maximum?: number;
  description?: string;
  example?: number;
}

export interface SchemaBooleanOptions {
  description?: string;
  example?: boolean;
}

export interface SchemaArrayOptions {
  description?: string;
  minItems?: number;
  maxItems?: number;
}

export interface SchemaObjectOptions {
  description?: string;
}

export interface SchemaEnumOptions {
  description?: string;
}

export function schemaString(options?: SchemaStringOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "string" };
  if (options) {
    if (options.minLength !== undefined) schema.minLength = options.minLength;
    if (options.maxLength !== undefined) schema.maxLength = options.maxLength;
    if (options.pattern !== undefined) schema.pattern = options.pattern;
    if (options.format !== undefined) schema.format = options.format;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

export function schemaNumber(options?: SchemaNumberOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "number" };
  if (options) {
    if (options.minimum !== undefined) schema.minimum = options.minimum;
    if (options.maximum !== undefined) schema.maximum = options.maximum;
    if (options.format !== undefined) schema.format = options.format;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

export function schemaInteger(options?: SchemaIntegerOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "integer" };
  if (options) {
    if (options.minimum !== undefined) schema.minimum = options.minimum;
    if (options.maximum !== undefined) schema.maximum = options.maximum;
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

export function schemaBoolean(options?: SchemaBooleanOptions): OpenAPISchema {
  const schema: OpenAPISchema = { type: "boolean" };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
    if (options.example !== undefined) schema.example = options.example;
  }
  return schema;
}

export function schemaArray(
  items: OpenAPISchema,
  options?: SchemaArrayOptions,
): OpenAPISchema {
  const schema: OpenAPISchema = { type: "array", items };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

export function schemaObject(
  properties: Record<string, OpenAPISchema>,
  required?: string[],
  options?: SchemaObjectOptions,
): OpenAPISchema {
  const schema: OpenAPISchema = { type: "object", properties };
  if (required && required.length > 0) {
    schema.required = required;
  }
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

export function schemaEnum(
  values: unknown[],
  options?: SchemaEnumOptions,
): OpenAPISchema {
  const schema: OpenAPISchema = { enum: values };
  if (options) {
    if (options.description !== undefined) schema.description = options.description;
  }
  return schema;
}

export function schemaRef(name: string): OpenAPISchema {
  return { $ref: `#/components/schemas/${name}` };
}
