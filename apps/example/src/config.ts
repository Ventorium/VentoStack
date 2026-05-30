import {
  type ConfigSchema,
  type ConfigValue,
  createConfig,
  securityPrecheck,
} from "@ventostack/core";

const schema = {
  port: {
    type: "number",
    default: 3133,
    env: "PORT",
  },
  jwtSecret: {
    type: "string",
    default: "ventostack-example-secret-key-at-least-32-bytes!",
    env: "JWT_SECRET",
    secret: true,
  },
  jwtExpiresIn: {
    type: "number",
    default: 3600,
    env: "JWT_EXPIRES_IN",
  },
  dbPath: {
    type: "string",
    default: "./data/app.db",
    env: "DB_PATH",
  },
  env: {
    type: "string",
    default: "development",
    env: "NODE_ENV",
    options: ["development", "staging", "production", "test"] as const,
  },
} as const satisfies ConfigSchema;

export type AppConfig = {
  [K in keyof ConfigValue<typeof schema>]: NonNullable<ConfigValue<typeof schema>[K]>;
};

export const config = createConfig(schema) as AppConfig;

// ── 安全预检 ────────────────────────────────────────

const check = securityPrecheck({
  requiredSecrets: ["JWT_SECRET"],
  minSecretLength: 32,
  disallowDebug: true,
});

if (config.env === "production" && !check.passed) {
  throw new Error(`Security precheck failed:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`);
}
