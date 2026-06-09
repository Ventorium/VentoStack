import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createViteBridge } from "../vite-bridge";
import type { ViteBridge } from "../types";

const fixtureBase = join(import.meta.dir, "..", "..", ".test-fixtures");
const nodeModulesSource = join(import.meta.dir, "..", "..", "node_modules");

let tmpDir: string;
let bridge: ViteBridge | null = null;
let portCounter = 49200;

function nextPort(): number {
  return portCounter++;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(fixtureBase, "web-"));
  await writeFile(
    join(tmpDir, "index.html"),
    `<!doctype html><html><body><div id="app"></div></body></html>`,
  );
  await symlink(nodeModulesSource, join(tmpDir, "node_modules"), "dir");
});

afterEach(async () => {
  if (bridge) {
    await bridge.close();
    bridge = null;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

describe("createViteBridge", () => {
  test("returns bridge instance with expected shape", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });

    expect(typeof bridge.fetchFallback).toBe("function");
    expect(typeof bridge.restart).toBe("function");
    expect(typeof bridge.close).toBe("function");
    expect(typeof bridge.hmrPort).toBe("number");
    expect(bridge.hmrPort).toBeGreaterThan(0);
  });

  test("respects custom hmrPort", async () => {
    const port = nextPort();
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: port });
    expect(bridge.hmrPort).toBe(port);
  });
});

describe("fetchFallback", () => {
  test("serves index.html for root path", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });

    const res = await bridge.fetchFallback(new Request("http://localhost/"), {} as never);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const html = await res!.text();
    expect(html).toContain('<div id="app">');
  });

  test("returns null for /api/ prefix (default skip)", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });

    const res = await bridge.fetchFallback(
      new Request("http://localhost/api/users"),
      {} as never,
    );
    expect(res).toBeNull();
  });

  test("respects custom skipPrefixes", async () => {
    bridge = await createViteBridge({
      webDir: tmpDir,
      hmrPort: nextPort(),
      skipPrefixes: ["/custom-api/", "/webhooks/"],
    });

    // Custom prefix is skipped
    expect(
      await bridge.fetchFallback(
        new Request("http://localhost/custom-api/data"),
        {} as never,
      ),
    ).toBeNull();

    expect(
      await bridge.fetchFallback(
        new Request("http://localhost/webhooks/gh"),
        {} as never,
      ),
    ).toBeNull();

    // /api/ is no longer skipped — Vite handles it
    const handled = await bridge.fetchFallback(
      new Request("http://localhost/api/users"),
      {} as never,
    );
    expect(handled).not.toBeNull();
  });

  test("SPA fallback returns index.html for unknown paths", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });

    const res = await bridge.fetchFallback(
      new Request("http://localhost/some/spa/route"),
      {} as never,
    );

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const html = await res!.text();
    expect(html).toContain('<div id="app">');
  });
});

describe("close", () => {
  test("close() is idempotent", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });
    await bridge.close();
    await bridge.close(); // should not throw
    bridge = null;
  });

  test("fetchFallback returns null after close", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });
    await bridge.close();

    const res = await bridge.fetchFallback(new Request("http://localhost/"), {} as never);
    expect(res).toBeNull();

    bridge = null;
  });
});

describe("restart", () => {
  test("restart() keeps bridge functional", async () => {
    bridge = await createViteBridge({ webDir: tmpDir, hmrPort: nextPort() });

    const before = await bridge.fetchFallback(
      new Request("http://localhost/"),
      {} as never,
    );
    expect(before).not.toBeNull();

    await bridge.restart();

    const after = await bridge.fetchFallback(
      new Request("http://localhost/"),
      {} as never,
    );
    expect(after).not.toBeNull();
    expect(after!.status).toBe(200);
  });
});
