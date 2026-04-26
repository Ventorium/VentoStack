/**
 * 环境变量定义、读取与校验
 *
 * 所有外部配置集中在入口，业务代码通过 Config 对象读取，不直接访问 process.env。
 */

import type { Environment, LogLevel } from "../types";

// ===== 环境变量声明 =====

export interface EnvVars {
  NODE_ENV: Environment;
  PORT: number;
  HOST: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS: string[];
  LOG_LEVEL: LogLevel;
  CACHE_DRIVER: "memory" | "redis";
  REDIS_URL?: string;
  SESSION_TTL_SECONDS: number;
  MAX_DEVICES_PER_USER: number;
  BCRYPT_COST: number;
}

// ===== 默认值 =====

const DEFAULTS: Partial<Record<keyof EnvVars, string>> = {
  NODE_ENV: "development",
  PORT: "8080",
  HOST: "0.0.0.0",
  LOG_LEVEL: "info",
  CACHE_DRIVER: "memory",
  SESSION_TTL_SECONDS: "1800",
  MAX_DEVICES_PER_USER: "5",
  BCRYPT_COST: "10",
};

// ===== 读取与转换 =====

function readEnv(): Partial<Record<keyof EnvVars, string>> {
  const raw: Record<string, string | undefined> = { ...process.env };
  const result: Partial<Record<keyof EnvVars, string>> = {};

  // 定义所有已知的配置键
  const keys: (keyof EnvVars)[] = [
    "NODE_ENV", "PORT", "HOST", "DATABASE_URL", "JWT_SECRET",
    "ALLOWED_ORIGINS", "LOG_LEVEL", "CACHE_DRIVER", "REDIS_URL",
    "SESSION_TTL_SECONDS", "MAX_DEVICES_PER_USER", "BCRYPT_COST",
  ];

  for (const key of keys) {
    const envValue = raw[key];
    if (envValue !== undefined) {
      result[key] = envValue;
    } else if (key in DEFAULTS) {
      result[key] = DEFAULTS[key as keyof typeof DEFAULTS];
    }
    // 没有默认值且没设置 → 保持 undefined，由 validator 捕获
  }

  return result;
}

// ===== 校验规则 =====

interface ValidationError {
  field: string;
  message: string;
}

const VALIDATORS: Array<(env: Partial<Record<keyof EnvVars, string>>) => ValidationError | null> = [
  (e) => {
    const secret = e.JWT_SECRET;
    if (!secret) return { field: "JWT_SECRET", message: "JWT_SECRET is required in production" };
    if (secret.length < 32 && e.NODE_ENV === "production") {
      return { field: "JWT_SECRET", message: "JWT_SECRET must be at least 32 characters in production" };
    }
    return null;
  },
  (e) => {
    if (!e.DATABASE_URL) return { field: "DATABASE_URL", message: "DATABASE_URL is required" };
    return null;
  },
  (e) => {
    if (e.CACHE_DRIVER === "redis" && !e.REDIS_URL) {
      return { field: "REDIS_URL", message: "REDIS_URL is required when CACHE_DRIVER=redis" };
    }
    return null;
  },
  (e) => {
    if (e.NODE_ENV && !["development", "production", "test"].includes(e.NODE_ENV)) {
      return { field: "NODE_ENV", message: `Invalid NODE_ENV: ${e.NODE_ENV}` };
    }
    return null;
  },
];

// ===== 转换器 =====

function toNumber(raw: string | undefined, field: keyof EnvVars): number {
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Invalid numeric value for ${field}: ${raw}`);
  return n;
}

function parseEnv(): EnvVars {
  const raw = readEnv();

  const errors = VALIDATORS.map((v) => v(raw)).filter(Boolean) as ValidationError[];
  if (errors.length > 0) {
    const details = errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${details}`);
  }

  return {
    NODE_ENV: (raw.NODE_ENV ?? "development") as Environment,
    PORT: toNumber(raw.PORT, "PORT"),
    HOST: raw.HOST ?? "0.0.0.0",
    DATABASE_URL: raw.DATABASE_URL!,
    JWT_SECRET: raw.JWT_SECRET!,
    ALLOWED_ORIGINS: (raw.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()),
    LOG_LEVEL: raw.LOG_LEVEL as LogLevel,
    CACHE_DRIVER: (raw.CACHE_DRIVER ?? "memory") as "memory" | "redis",
    REDIS_URL: raw.REDIS_URL,
    SESSION_TTL_SECONDS: toNumber(raw.SESSION_TTL_SECONDS, "SESSION_TTL_SECONDS"),
    MAX_DEVICES_PER_USER: toNumber(raw.MAX_DEVICES_PER_USER, "MAX_DEVICES_PER_USER"),
    BCRYPT_COST: toNumber(raw.BCRYPT_COST, "BCRYPT_COST"),
  };
}

export const env = parseEnv();
