import type { Plugin, VentoStackApp } from "@ventostack/core";
import { syncRouterToOpenAPI } from "./decorators";
import {
  createOpenAPIGenerator,
  type OpenAPIGenerator,
  type OpenAPIInfo,
  type OpenAPIServer,
  type OpenAPITag,
} from "./generator";
import { createScalarUIHandler } from "./scalar-ui";

const DEFAULT_INFO: OpenAPIInfo = {
  title: "API Documentation",
  version: "1.0.0",
};

const DEFAULT_JSON_PATH = "/openapi.json";
const DEFAULT_DOCS_PATH = "/docs";

const scheduledOpenAPIConfigs = new WeakMap<VentoStackApp, string>();
const installedOpenAPIConfigs = new WeakMap<VentoStackApp, string>();

export interface OpenAPISetupOptions {
  /** OpenAPI 文档信息，未传入时使用默认值 */
  info?: Partial<OpenAPIInfo>;
  /** 服务端点列表 */
  servers?: readonly OpenAPIServer[];
  /** 标签定义 */
  tags?: readonly OpenAPITag[];
  /** 安全方案定义 */
  securitySchemes?: Readonly<Record<string, unknown>>;
  /** OpenAPI JSON 路径，默认 /openapi.json */
  jsonPath?: string;
  /** 文档 UI 路径，默认 /docs */
  docsPath?: string;
  /** 文档 UI 页面标题，默认使用 info.title */
  docsTitle?: string;
  /** Scalar UI CDN 版本 */
  scalarVersion?: string;
}

interface ResolvedOpenAPISetupOptions {
  info: OpenAPIInfo;
  servers: readonly OpenAPIServer[];
  tags: readonly OpenAPITag[];
  securitySchemes: Readonly<Record<string, unknown>>;
  jsonPath: string;
  docsPath: string;
  docsTitle: string;
  scalarVersion?: string;
}

function normalizeKeyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeKeyValue(entry));
  }

  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeKeyValue((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }

  return value;
}

function createConfigKey(options: ResolvedOpenAPISetupOptions): string {
  return JSON.stringify(
    normalizeKeyValue({
      info: options.info,
      servers: options.servers,
      tags: options.tags,
      securitySchemes: options.securitySchemes,
      jsonPath: options.jsonPath,
      docsPath: options.docsPath,
      docsTitle: options.docsTitle,
      scalarVersion: options.scalarVersion ?? null,
    }),
  );
}

function resolveOptions(options: OpenAPISetupOptions): ResolvedOpenAPISetupOptions {
  const info: OpenAPIInfo = {
    ...DEFAULT_INFO,
    ...options.info,
  };

  const jsonPath = options.jsonPath ?? DEFAULT_JSON_PATH;
  const docsPath = options.docsPath ?? DEFAULT_DOCS_PATH;

  if (jsonPath === docsPath) {
    throw new Error("OpenAPI JSON path and docs path must be different");
  }

  return {
    info,
    servers: options.servers ?? [],
    tags: options.tags ?? [],
    securitySchemes: options.securitySchemes ?? {},
    jsonPath,
    docsPath,
    docsTitle: options.docsTitle ?? info.title,
    ...(options.scalarVersion !== undefined ? { scalarVersion: options.scalarVersion } : {}),
  };
}

function rememberConfig(
  store: WeakMap<VentoStackApp, string>,
  app: VentoStackApp,
  configKey: string,
): boolean {
  const existingKey = store.get(app);
  if (existingKey === undefined) {
    store.set(app, configKey);
    return true;
  }

  if (existingKey === configKey) {
    return false;
  }

  throw new Error("OpenAPI is already configured for this app");
}

function createConfiguredGenerator(options: ResolvedOpenAPISetupOptions): OpenAPIGenerator {
  const generator = createOpenAPIGenerator();
  generator.setInfo(options.info);

  for (const server of options.servers) {
    generator.addServer(server);
  }

  for (const tag of options.tags) {
    generator.addTag(tag.name, tag.description);
  }

  for (const [name, scheme] of Object.entries(options.securitySchemes)) {
    generator.addSecurityScheme(name, scheme);
  }

  return generator;
}

function generateDocument(
  app: VentoStackApp,
  options: ResolvedOpenAPISetupOptions,
): ReturnType<OpenAPIGenerator["generate"]> {
  const generator = createConfiguredGenerator(options);
  syncRouterToOpenAPI(app.router, generator, {
    excludePaths: [options.jsonPath, options.docsPath],
  });
  return generator.generate();
}

function createOpenAPIPluginFromResolved(
  resolved: ResolvedOpenAPISetupOptions,
  configKey: string,
): Plugin {
  let isInstalled = false;
  let document = createConfiguredGenerator(resolved).generate();

  return {
    name: "openapi",
    install(app: VentoStackApp) {
      if (!rememberConfig(installedOpenAPIConfigs, app, configKey) || isInstalled) {
        return;
      }

      isInstalled = true;
      app.lifecycle.onBeforeRouteCompile(() => {
        document = generateDocument(app, resolved);
      }, 100);

      app.router.get(resolved.jsonPath, async (ctx) => ctx.json(document));
      app.addUrl("OpenAPI JSON", resolved.jsonPath);

      app.router.get(
        resolved.docsPath,
        createScalarUIHandler({
          specUrl: resolved.jsonPath,
          title: resolved.docsTitle,
          ...(resolved.scalarVersion !== undefined ? { version: resolved.scalarVersion } : {}),
        }),
      );
      app.addUrl("OpenAPI Docs", resolved.docsPath);
    },
  };
}

export function createOpenAPIPlugin(options: OpenAPISetupOptions = {}): Plugin {
  const resolved = resolveOptions(options);
  return createOpenAPIPluginFromResolved(resolved, createConfigKey(resolved));
}

export function setupOpenAPI(app: VentoStackApp, options: OpenAPISetupOptions = {}): VentoStackApp {
  const resolved = resolveOptions(options);
  const configKey = createConfigKey(resolved);

  if (!rememberConfig(scheduledOpenAPIConfigs, app, configKey)) {
    return app;
  }

  app.use(createOpenAPIPluginFromResolved(resolved, configKey));
  return app;
}