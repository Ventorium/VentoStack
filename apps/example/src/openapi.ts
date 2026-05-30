import type { VentoStackApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";

export function setupExampleOpenAPI(app: VentoStackApp) {
  return setupOpenAPI(app, {
    info: {
      title: "VentoStack Example API",
      version: "1.0.0",
      description: "Production-grade example API for VentoStack framework",
    },
    servers: [
      {
        url: "http://localhost:3133",
        description: "Local development server",
      },
    ],
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    docsTitle: "VentoStack Example API Docs",
  });
}
