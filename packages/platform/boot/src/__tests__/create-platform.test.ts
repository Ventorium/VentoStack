/**
 * @ventostack/boot - 平台创建测试
 *
 * 注意：boot 包是聚合器，依赖所有平台模块。
 * 完整的集成测试需要在应用层（apps/）中运行，
 * 因为需要真实的依赖解析和数据库连接。
 * 这里只验证模块结构。
 */

import { describe, expect, it } from "bun:test";

describe("Boot package", () => {
  it("should have correct package structure", () => {
    // Verify the source files exist
    const fs = require("node:fs") as { existsSync: (p: string) => boolean };
    const path = require("node:path") as { join: (...args: string[]) => string };

    const base = path.join(__dirname, "..");
    expect(fs.existsSync(path.join(base, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(base, "create-platform.ts"))).toBe(true);
  });

  it("createPlatform should be a function", async () => {
    // Read the source to verify the export exists
    const fs = require("node:fs") as { readFileSync: (p: string, enc: string) => string };
    const path = require("node:path") as { join: (...args: string[]) => string };

    const src = fs.readFileSync(path.join(__dirname, "..", "create-platform.ts"), "utf-8");
    expect(src).toContain("export async function createPlatform");
    expect(src).toContain("export interface PlatformConfig");
    expect(src).toContain("export interface Platform");
  });
});
