import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "@ventostack/core";
import { setupOpenAPI } from "../setup";

let appToClose: ReturnType<typeof createApp> | null = null;

afterEach(async () => {
  if (appToClose) {
    await appToClose.close();
    appToClose = null;
  }
});

function randomPort(): number {
  return 40000 + Math.floor(Math.random() * 10000);
}

describe("setupOpenAPI", () => {
  test("registers default JSON and docs endpoints and auto-syncs app routes", async () => {
    const app = createApp();
    app.router.get("/hello", (ctx) => ctx.json({ ok: true }));

    setupOpenAPI(app, {
      info: {
        title: "Test API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    expect(openAPIResponse.status).toBe(200);

    const document = (await openAPIResponse.json()) as {
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    expect(document.info.title).toBe("Test API");
    expect(document.info.version).toBe("1.0.0");
    expect(document.paths["/hello"]).toBeDefined();
    expect(document.paths["/openapi.json"]).toBeUndefined();
    expect(document.paths["/docs"]).toBeUndefined();

    const docsResponse = await fetch(`http://localhost:${port}/docs`);
    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers.get("Content-Type")).toContain("text/html");
  });

  test("allows overriding OpenAPI endpoint paths", async () => {
    const app = createApp();
    app.router.get("/users", (ctx) => ctx.json([{ id: 1 }]));

    setupOpenAPI(app, {
      info: {
        title: "Custom API",
        version: "2.0.0",
      },
      jsonPath: "/api/spec.json",
      docsPath: "/reference",
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const customJsonResponse = await fetch(`http://localhost:${port}/api/spec.json`);
    expect(customJsonResponse.status).toBe(200);

    const customDocument = (await customJsonResponse.json()) as {
      paths: Record<string, unknown>;
    };

    expect(customDocument.paths["/users"]).toBeDefined();
    expect(customDocument.paths["/api/spec.json"]).toBeUndefined();
    expect(customDocument.paths["/reference"]).toBeUndefined();

    const customDocsResponse = await fetch(`http://localhost:${port}/reference`);
    expect(customDocsResponse.status).toBe(200);
    const docsHtml = await customDocsResponse.text();
    expect(docsHtml).toContain("/api/spec.json");

    const defaultJsonResponse = await fetch(`http://localhost:${port}/openapi.json`);
    expect(defaultJsonResponse.status).toBe(404);

    const defaultDocsResponse = await fetch(`http://localhost:${port}/docs`);
    expect(defaultDocsResponse.status).toBe(404);
  });

  test("captures routes added before start but excludes routes added after start", async () => {
    const app = createApp();
    app.router.get("/initial", (ctx) => ctx.json({ ok: true }));

    setupOpenAPI(app, {
      info: {
        title: "Timing API",
        version: "1.0.0",
      },
    });

    app.router.get("/before-start", (ctx) => ctx.json({ ok: true }));

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    app.router.get("/late", (ctx) => ctx.json({ ok: true }));

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    expect(openAPIResponse.status).toBe(200);

    const document = (await openAPIResponse.json()) as {
      paths: Record<string, unknown>;
    };

    expect(document.paths["/initial"]).toBeDefined();
    expect(document.paths["/before-start"]).toBeDefined();
    expect(document.paths["/late"]).toBeUndefined();

    const lateRouteResponse = await fetch(`http://localhost:${port}/late`);
    expect(lateRouteResponse.status).toBe(404);
  });

  test("can listen again after close without duplicating OpenAPI routes", async () => {
    const app = createApp();
    app.router.get("/health", (ctx) => ctx.json({ ok: true }));

    setupOpenAPI(app, {
      info: {
        title: "Restart API",
        version: "1.0.0",
      },
    });

    await app.listen(randomPort());
    await app.close();

    const secondPort = randomPort();
    await app.listen(secondPort);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${secondPort}/openapi.json`);
    expect(openAPIResponse.status).toBe(200);
  });

  test("calling setupOpenAPI twice with the same options is a no-op", async () => {
    const app = createApp();
    const options = {
      info: {
        title: "Duplicate API",
        version: "1.0.0",
      },
      jsonPath: "/spec.json",
      docsPath: "/reference",
    } as const;

    setupOpenAPI(app, options);
    setupOpenAPI(app, options);

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/spec.json`);
    expect(openAPIResponse.status).toBe(200);
  });

  test("throws when setupOpenAPI is called again with different options", () => {
    const app = createApp();

    setupOpenAPI(app, {
      info: {
        title: "First API",
        version: "1.0.0",
      },
    });

    expect(() =>
      setupOpenAPI(app, {
        info: {
          title: "Second API",
          version: "2.0.0",
        },
        jsonPath: "/spec.json",
      }),
    ).toThrow("OpenAPI is already configured");
  });

  test("throws when JSON and docs paths are the same", () => {
    const app = createApp();

    expect(() =>
      setupOpenAPI(app, {
        jsonPath: "/docs",
        docsPath: "/docs",
      }),
    ).toThrow("OpenAPI JSON path and docs path must be different");
  });

  test("includes routes added by later plugins before route compilation", async () => {
    const app = createApp();

    setupOpenAPI(app, {
      info: {
        title: "Plugin Timing API",
        version: "1.0.0",
      },
    });

    app.use({
      name: "late-routes",
      install(targetApp) {
        targetApp.lifecycle.onBeforeRouteCompile(() => {
          targetApp.router.get("/late-plugin-route", (ctx) => ctx.json({ ok: true }));
        });
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const routeResponse = await fetch(`http://localhost:${port}/late-plugin-route`);
    expect(routeResponse.status).toBe(200);

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<string, unknown>;
    };

    expect(document.paths["/late-plugin-route"]).toBeDefined();
  });

  test("treats equivalent option objects with different key order as the same config", async () => {
    const app = createApp();

    setupOpenAPI(app, {
      info: {
        title: "Stable Key API",
        version: "1.0.0",
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
    });

    expect(() =>
      setupOpenAPI(app, {
        info: {
          title: "Stable Key API",
          version: "1.0.0",
        },
        securitySchemes: {
          apiKey: {
            name: "X-API-Key",
            in: "header",
            type: "apiKey",
          },
          bearerAuth: {
            scheme: "bearer",
            type: "http",
          },
        },
      }),
    ).not.toThrow();

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    expect(openAPIResponse.status).toBe(200);
  });

  test("documents multipart form-data request bodies from route schema", async () => {
    const app = createApp();

    app.router.post(
      "/upload",
      {
        formData: {
          file: { type: "file", required: true },
          name: { type: "string", required: true },
        },
      },
      (ctx) => ctx.json({ ok: true }),
    );

    setupOpenAPI(app, {
      info: {
        title: "Upload API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<string, { post?: { requestBody?: { content: Record<string, { schema: { type: string; required?: string[]; properties?: Record<string, { format?: string; type: string }> } }> } } }>;
    };

    const requestBody = document.paths["/upload"]?.post?.requestBody;
    expect(requestBody?.content["multipart/form-data"]).toBeDefined();
    expect(requestBody?.content["multipart/form-data"]?.schema.type).toBe("object");
    expect(requestBody?.content["multipart/form-data"]?.schema.required).toEqual(["file", "name"]);
    expect(requestBody?.content["multipart/form-data"]?.schema.properties?.file?.format).toBe("binary");
  });

  test("infers simple helper responses when no explicit response schema is provided", async () => {
    const app = createApp();

    app.router.get("/text", (ctx) => ctx.text("hello"));
    app.router.get("/html", (ctx) => ctx.html("<p>hi</p>", 201));
    app.router.get("/json", (ctx) => ctx.json({ ok: true }));
    app.router.get("/redirect", (ctx) => ctx.redirect("/next", 307));
    app.router.get(
      "/events",
      (ctx) =>
        ctx.stream(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          "text/event-stream",
        ),
    );

    setupOpenAPI(app, {
      info: {
        title: "Inference API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<
        string,
        {
          get?: {
            responses: Record<
              string,
              {
                description: string;
                content?: Record<string, { schema: { type: string } }>;
              }
            >;
          };
        }
      >;
    };

    expect(document.paths["/text"]?.get?.responses["200"]?.content?.["text/plain"]?.schema.type).toBe("string");
    expect(document.paths["/html"]?.get?.responses["201"]?.content?.["text/html"]?.schema.type).toBe("string");
    expect(document.paths["/json"]?.get?.responses["200"]?.content?.["application/json"]?.schema.type).toBe("object");
    expect(document.paths["/redirect"]?.get?.responses["307"]?.description).toBe("Redirect");
    expect(document.paths["/events"]?.get?.responses["200"]?.content?.["text/event-stream"]?.schema.type).toBe("string");
  });

  test("infers null JSON responses and ignores commented helper calls", async () => {
    const app = createApp();

    app.router.get("/null-json", (ctx) => ctx.json(null));
    app.router.get("/commented-redirect", (ctx) => {
      // return ctx.html("<p>preview</p>");
      return ctx.redirect("/next", 308);
    });

    setupOpenAPI(app, {
      info: {
        title: "Literal Inference API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<
        string,
        {
          get?: {
            responses: Record<
              string,
              {
                description: string;
                content?: Record<string, { schema: { type?: string; nullable?: boolean } }>;
              }
            >;
          };
        }
      >;
    };

    expect(document.paths["/null-json"]?.get?.responses["200"]?.content?.["application/json"]?.schema.nullable).toBe(true);
    expect(document.paths["/commented-redirect"]?.get?.responses["308"]?.description).toBe("Redirect");
  });

  test("does not infer helper responses from non-returned helper calls", async () => {
    const app = createApp();

    app.router.get("/not-direct", (ctx) => {
      const preview = ctx.json({ ok: false }, 500);
      void preview;
      return new Response("ok", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    });

    setupOpenAPI(app, {
      info: {
        title: "Inference Guard API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<
        string,
        {
          get?: {
            responses: Record<string, { description: string; content?: Record<string, unknown> }>;
          };
        }
      >;
    };

    expect(document.paths["/not-direct"]?.get?.responses["500"]).toBeUndefined();
    expect(document.paths["/not-direct"]?.get?.responses["200"]?.description).toBe("Success");
  });

  test("does not infer helper responses from nested closures", async () => {
    const app = createApp();

    app.router.get("/nested-helper", (ctx) => {
      const buildPreview = () => ctx.json({ ok: false });
      void buildPreview;
      return new Response("ok", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    });

    setupOpenAPI(app, {
      info: {
        title: "Nested Guard API",
        version: "1.0.0",
      },
    });

    const port = randomPort();
    await app.listen(port);
    appToClose = app;

    const openAPIResponse = await fetch(`http://localhost:${port}/openapi.json`);
    const document = (await openAPIResponse.json()) as {
      paths: Record<
        string,
        {
          get?: {
            responses: Record<string, { description: string; content?: Record<string, unknown> }>;
          };
        }
      >;
    };

    expect(document.paths["/nested-helper"]?.get?.responses["200"]?.content).toBeUndefined();
    expect(document.paths["/nested-helper"]?.get?.responses["200"]?.description).toBe("Success");
  });
});