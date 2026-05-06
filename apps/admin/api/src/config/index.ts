/**
 * 环境变量定义、读取与校验
 *
 * 使用 @ventostack/core 的 createConfig 统一管理配置，
 * 支持类型推导、默认值、必填校验、枚举约束和敏感字段脱敏。
 */

import { createConfig } from "@ventostack/core";

const rawConfig = createConfig({
  NODE_ENV: {
    type: "string",
    env: "NODE_ENV",
    default: "development",
    options: ["development", "production", "test"],
  },
  PORT: { type: "number", env: "PORT", default: 9320 },
  HOST: { type: "string", env: "HOST", default: "0.0.0.0" },
  DATABASE_URL: {
    type: "string",
    env: "DATABASE_URL",
    required: true,
    sensitive: true,
  },
  JWT_SECRET: {
    type: "string",
    env: "JWT_SECRET",
    required: true,
    sensitive: true,
  },
  ALLOWED_ORIGINS: {
    type: "string",
    env: "ALLOWED_ORIGINS",
    default: "http://localhost:5173",
  },
  LOG_LEVEL: {
    type: "string",
    env: "LOG_LEVEL",
    default: "info",
    options: ["debug", "info", "warn", "error"],
  },
  CACHE_DRIVER: {
    type: "string",
    env: "CACHE_DRIVER",
    default: "memory",
    options: ["memory", "redis"],
  },
  REDIS_URL: { type: "string", env: "REDIS_URL" },
  SESSION_TTL_SECONDS: {
    type: "number",
    env: "SESSION_TTL_SECONDS",
    default: 1800,
  },
  MAX_DEVICES_PER_USER: {
    type: "number",
    env: "MAX_DEVICES_PER_USER",
    default: 5,
  },
  BCRYPT_COST: { type: "number", env: "BCRYPT_COST", default: 10 },
  WEBAUTHN_RP_ID: { type: "string", env: "WEBAUTHN_RP_ID", default: "localhost" },
  WEBAUTHN_RP_NAME: { type: "string", env: "WEBAUTHN_RP_NAME", default: "VentoStack Admin" },
}, process.env);

// 跨字段校验
if (rawConfig.CACHE_DRIVER === "redis" && !rawConfig.REDIS_URL) {
  throw new Error("REDIS_URL is required when CACHE_DRIVER=redis");
}

// ALLOWED_ORIGINS: 逗号分隔 → string[]
export const env = {
  ...rawConfig,
  ALLOWED_ORIGINS: rawConfig.ALLOWED_ORIGINS.split(",").map((s) => s.trim()),
};

export type EnvVars = typeof env;
