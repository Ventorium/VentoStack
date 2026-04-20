// ============================================================
// @aeron/openapi — Generator
// OpenAPI 3.0 文档生成器
// ============================================================

import type { OpenAPISchema } from "./schema-builder";

// ---- Types ----

export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenAPIServer {
  url: string;
  description?: string;
}

export interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema: OpenAPISchema;
  description?: string;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: OpenAPISchema }>;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema }>;
}

export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface OpenAPIPath {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

export interface OpenAPITag {
  name: string;
  description?: string;
}

export interface OpenAPIDocument {
  openapi: "3.0.3";
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, OpenAPIPath>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: OpenAPITag[];
}

export interface OpenAPIGenerator {
  setInfo(info: OpenAPIInfo): void;
  addServer(server: OpenAPIServer): void;
  addTag(name: string, description?: string): void;
  addSchema(name: string, schema: OpenAPISchema): void;
  addSecurityScheme(name: string, scheme: unknown): void;
  addPath(path: string, method: string, operation: OpenAPIOperation): void;
  generate(): OpenAPIDocument;
  toJSON(): string;
  toYAML(): string;
}

// ---- YAML serializer ----

const YAML_INDENT = "  ";

function yamlEscapeString(value: string): string {
  if (
    value === "" ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /^\d+(\.\d+)?$/.test(value) ||
    /[:{}\[\],&*?|>!%#@`"'\n\r]/.test(value) ||
    value.startsWith(" ") ||
    value.endsWith(" ")
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function toYAMLValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return yamlEscapeString(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const lines: string[] = [];
    const prefix = YAML_INDENT.repeat(depth);
    for (const item of value) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) {
          lines.push(`${prefix}- {}`);
        } else {
          const [firstKey, firstVal] = entries[0]!;
          lines.push(
            `${prefix}- ${firstKey}: ${toYAMLValue(firstVal, depth + 2)}`,
          );
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i]!;
            lines.push(
              `${prefix}  ${k}: ${toYAMLValue(v, depth + 2)}`,
            );
          }
        }
      } else {
        lines.push(`${prefix}- ${toYAMLValue(item, depth + 1)}`);
      }
    }
    return "\n" + lines.join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return "{}";
    }
    const lines: string[] = [];
    const prefix = YAML_INDENT.repeat(depth);
    for (const key of keys) {
      const val = obj[key];
      const rendered = toYAMLValue(val, depth + 1);
      if (rendered.startsWith("\n")) {
        lines.push(`${prefix}${key}:${rendered}`);
      } else {
        lines.push(`${prefix}${key}: ${rendered}`);
      }
    }
    return "\n" + lines.join("\n");
  }
  return String(value);
}

export function toYAML(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return toYAMLValue(obj, 0);
  }
  const record = obj as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of Object.keys(record)) {
    const val = record[key];
    const rendered = toYAMLValue(val, 1);
    if (rendered.startsWith("\n")) {
      lines.push(`${key}:${rendered}`);
    } else {
      lines.push(`${key}: ${rendered}`);
    }
  }
  return lines.join("\n") + "\n";
}

// ---- Factory ----

const VALID_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export function createOpenAPIGenerator(): OpenAPIGenerator {
  let info: OpenAPIInfo = { title: "", version: "0.0.0" };
  const servers: OpenAPIServer[] = [];
  const tags: OpenAPITag[] = [];
  const schemas: Record<string, OpenAPISchema> = {};
  const securitySchemes: Record<string, unknown> = {};
  const paths: Record<string, OpenAPIPath> = {};

  return {
    setInfo(newInfo: OpenAPIInfo): void {
      info = newInfo;
    },

    addServer(server: OpenAPIServer): void {
      servers.push(server);
    },

    addTag(name: string, description?: string): void {
      const tag: OpenAPITag = { name };
      if (description !== undefined) {
        tag.description = description;
      }
      tags.push(tag);
    },

    addSchema(name: string, schema: OpenAPISchema): void {
      schemas[name] = schema;
    },

    addSecurityScheme(name: string, scheme: unknown): void {
      securitySchemes[name] = scheme;
    },

    addPath(path: string, method: string, operation: OpenAPIOperation): void {
      const m = method.toLowerCase();
      if (!VALID_METHODS.has(m)) {
        throw new Error(
          `Invalid HTTP method: ${method}. Must be one of: ${[...VALID_METHODS].join(", ")}`,
        );
      }
      if (!paths[path]) {
        paths[path] = {};
      }
      (paths[path] as Record<string, OpenAPIOperation>)[m] = operation;
    },

    generate(): OpenAPIDocument {
      const doc: OpenAPIDocument = {
        openapi: "3.0.3",
        info,
        paths,
      };

      if (servers.length > 0) {
        doc.servers = servers;
      }

      if (tags.length > 0) {
        doc.tags = tags;
      }

      const hasSchemas = Object.keys(schemas).length > 0;
      const hasSecuritySchemes = Object.keys(securitySchemes).length > 0;
      if (hasSchemas || hasSecuritySchemes) {
        doc.components = {};
        if (hasSchemas) {
          doc.components.schemas = schemas;
        }
        if (hasSecuritySchemes) {
          doc.components.securitySchemes = securitySchemes;
        }
      }

      return doc;
    },

    toJSON(): string {
      return JSON.stringify(this.generate(), null, 2);
    },

    toYAML(): string {
      return toYAML(this.generate());
    },
  };
}
